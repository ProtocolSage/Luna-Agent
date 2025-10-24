import { EventEmitter } from "events";
import type { STTEngine, STTTranscript } from "./STTEngine";

export class CloudSTT extends EventEmitter implements STTEngine {
  #stream?: WebSocket; // Azure / Deepgram streaming socket
  #retry = 0; // exponential-backoff index
  #abortController?: AbortController; // allow immediate stop()
  #micStream?: MediaStream; // microphone stream
  #mediaRecorder?: MediaRecorder; // audio capture

  private config = {
    service: process.env.CLOUD_STT_SERVICE || "azure", // 'azure' or 'deepgram'
    azureKey: process.env.AZURE_SPEECH_KEY,
    azureRegion: process.env.AZURE_SPEECH_REGION || "eastus",
    deepgramKey: process.env.DEEPGRAM_API_KEY,
    language: "en-US",
  };

  async start() {
    // IMPORTANT: This class runs in Electron main process and must NOT access
    // browser-only APIs like navigator.mediaDevices or MediaRecorder.
    // The renderer-side service `RendererCloudSTT` handles real audio capture.
    this.#abortController = new AbortController();
    const err = new Error(
      "getUserMedia not available in main process - Cloud STT must run in renderer",
    );
    console.warn(
      "[CloudSTT] Deprecated main-process start() called. Use renderer-based STT.",
    );
    // Emit fatal so orchestrators (e.g. HybridSTT) can stop or fail over.
    this.emit("fatal", err);
  }

  async stop() {
    // Best-effort cleanup; no browser API access
    try {
      this.#abortController?.abort();
    } catch {}
    try {
      (this.#stream as any)?.close?.();
    } catch {}
    try {
      this.#stopMicrophone();
    } catch {}
  }

  /* ---------- private helpers ---------- */

  async #setupMicrophone() {
    // STUBBED: Main process cannot access getUserMedia
    // This class should only be used from renderer process
    console.warn(
      "[CloudSTT] Microphone setup called in main process - stubbed",
    );
    throw new Error(
      "CloudSTT cannot access microphone from main process. Use renderer-based STT.",
    );

    // Setup MediaRecorder for streaming audio data
    // STUBBED: MediaRecorder not available in main process
    console.warn(
      "[CloudSTT] MediaRecorder setup skipped - not available in main process",
    );
    return;
  }

  #stopMicrophone() {
    if (this.#mediaRecorder && this.#mediaRecorder.state !== "inactive") {
      this.#mediaRecorder.stop();
    }
    if (this.#micStream) {
      this.#micStream.getTracks().forEach((track) => track.stop());
      this.#micStream = undefined;
    }
  }

  async #connectStream() {
    if (this.config.service === "azure") {
      await this.#connectAzure();
    } else if (this.config.service === "deepgram") {
      await this.#connectDeepgram();
    } else {
      throw new Error(`Unsupported STT service: ${this.config.service}`);
    }
  }

  async #connectAzure() {
    if (!this.config.azureKey) {
      throw new Error("Azure Speech key not configured");
    }

    const connectionId = this.#generateUUID();
    const wsUrl = `wss://${this.config.azureRegion}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1?${new URLSearchParams(
      {
        "Ocp-Apim-Subscription-Key": this.config.azureKey,
        "X-ConnectionId": connectionId,
        language: this.config.language,
        format: "simple",
      },
    )}`;

    this.#stream = new WebSocket(wsUrl);
    this.#stream.binaryType = "arraybuffer";

    this.#stream.onopen = () => {
      console.log("[CloudSTT] Azure WebSocket connected");
      this.#startAudioStreaming();
    };

    this.#stream.onmessage = (e) => {
      const t = this.#parseAzureMessage(e.data);
      if (t) this.emit("transcript", t);
    };

    this.#stream.onerror = () =>
      this.#handleFatal(new Error("azure-websocket-error"));
    this.#stream.onclose = () =>
      this.#handleFatal(new Error("azure-socket-closed"));
  }

  async #connectDeepgram() {
    if (!this.config.deepgramKey) {
      throw new Error("Deepgram API key not configured");
    }

    const wsUrl = `wss://api.deepgram.com/v1/listen?${new URLSearchParams({
      encoding: "webm",
      sample_rate: "16000",
      channels: "1",
      interim_results: "true",
      punctuate: "true",
      smart_format: "true",
    })}`;

    this.#stream = new WebSocket(wsUrl, ["token", this.config.deepgramKey]);
    this.#stream.binaryType = "arraybuffer";

    this.#stream.onopen = () => {
      console.log("[CloudSTT] Deepgram WebSocket connected");
      this.#startAudioStreaming();
    };

    this.#stream.onmessage = (e) => {
      const t = this.#parseDeepgramMessage(e.data);
      if (t) this.emit("transcript", t);
    };

    this.#stream.onerror = () =>
      this.#handleFatal(new Error("deepgram-websocket-error"));
    this.#stream.onclose = () =>
      this.#handleFatal(new Error("deepgram-socket-closed"));
  }

  #startAudioStreaming() {
    if (!this.#mediaRecorder) return;

    this.#mediaRecorder.ondataavailable = (event) => {
      if (
        event.data.size > 0 &&
        this.#stream &&
        this.#stream.readyState === WebSocket.OPEN
      ) {
        // Send audio data to STT service
        event.data.arrayBuffer().then((buffer) => {
          if (this.#stream && this.#stream.readyState === WebSocket.OPEN) {
            this.#stream.send(buffer);
          }
        });
      }
    };

    this.#mediaRecorder.start(100); // Send data every 100ms
  }

  #parseAzureMessage(data: any): STTTranscript | null {
    try {
      const parsed = JSON.parse(data);

      if (parsed.RecognitionStatus === "Success") {
        return {
          text: parsed.DisplayText || parsed.Text || "",
          isFinal: parsed.RecognitionStatus === "Success",
        };
      }

      if (
        parsed.RecognitionStatus === "InitialSilenceTimeout" ||
        parsed.RecognitionStatus === "BabbleTimeout"
      ) {
        // These are not errors, just continue
        return null;
      }

      if (parsed.RecognitionStatus === "Error") {
        throw new Error(
          `Azure STT error: ${parsed.ErrorMessage || "Unknown error"}`,
        );
      }
    } catch (err) {
      console.warn("[CloudSTT] Failed to parse Azure message:", err);
    }
    return null;
  }

  #parseDeepgramMessage(data: any): STTTranscript | null {
    try {
      const parsed = JSON.parse(data);

      if (
        parsed.channel &&
        parsed.channel.alternatives &&
        parsed.channel.alternatives.length > 0
      ) {
        const alternative = parsed.channel.alternatives[0];
        if (alternative.transcript && alternative.transcript.trim()) {
          return {
            text: alternative.transcript,
            isFinal: parsed.is_final || false,
          };
        }
      }
    } catch (err) {
      console.warn("[CloudSTT] Failed to parse Deepgram message:", err);
    }
    return null;
  }

  #handleFatal(err: Error) {
    console.warn("[CloudSTT] Engine failed →", err.message);
    this.#stopMicrophone();
    this.emit("fatal", err);

    // Simple exponential back-off for auto-retry (max 60 seconds)
    const delay = Math.min(60_000, 2 ** this.#retry * 1000);
    this.#retry++;

    // Don't retry immediately if aborted by user
    if (!this.#abortController?.signal.aborted) {
      setTimeout(() => {
        if (!this.#abortController?.signal.aborted) {
          this.start().catch(() => {
            // Will emit fatal and continue retry chain
          });
        }
      }, delay);
    }
  }

  #generateUUID(): string {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }
}
