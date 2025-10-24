import { spawn } from "child_process";
import { EventEmitter } from "events";
import type { STTEngine, STTTranscript } from "./STTEngine";
import path from "path";

export class WhisperSTT extends EventEmitter implements STTEngine {
  #proc?: any;
  #micStream?: any;
  #mediaRecorder?: any;
  #isRunning = false;

  async start() {
    if (this.#isRunning) return;
    // IMPORTANT: This class runs in Electron main process and must NOT access
    // browser-only APIs like navigator.mediaDevices or MediaRecorder.
    // Real local/whisper capture must be handled in the renderer or via a
    // dedicated native module. Emit a fatal error to signal orchestrators.
    const err = new Error(
      "getUserMedia not available in main process - Whisper STT must run in renderer",
    );
    console.warn(
      "[WhisperSTT] Deprecated main-process start() called. Use renderer-based STT.",
    );
    this.emit("fatal", err);
  }

  async stop() {
    this.#isRunning = false;
    try {
      this.#stopMicrophone();
    } catch {}
    try {
      this.#proc?.kill();
    } catch {}
    this.#proc = undefined;
  }

  /* ---------- private helpers ---------- */

  async #setupMicrophone() {
    // STUBBED: Main process cannot access getUserMedia
    // This class should only be used from renderer process
    console.warn(
      "[WhisperSTT] Microphone setup called in main process - stubbed",
    );
    throw new Error(
      "WhisperSTT cannot access microphone from main process. Use renderer-based STT.",
    );
  }

  #stopMicrophone() {
    if (this.#mediaRecorder && this.#mediaRecorder.state !== "inactive") {
      this.#mediaRecorder.stop();
    }
    if (this.#micStream) {
      this.#micStream.getTracks().forEach((track: any) => track.stop());
      this.#micStream = undefined;
    }
  }

  async #startWhisperProcess() {
    // In an Electron app, we need to handle this differently
    // For now, we'll use a simplified approach that could work with whisper.cpp

    const whisperPath = this.#getWhisperPath();
    const modelPath = this.#getModelPath();

    if (!whisperPath || !modelPath) {
      throw new Error(
        "Whisper executable or model not found. Please ensure Whisper is installed.",
      );
    }

    /* Start Whisper process with streaming support */
    this.#proc = spawn(
      whisperPath,
      [
        "-m",
        modelPath,
        "-f",
        "-", // read from stdin
        "-t",
        "4", // 4 threads (adjust for your CPU)
        "--no-prints", // suppress extra output
        "--no-timestamps", // we don't need timestamps
        "--output-json", // JSON output format
        "--stream", // streaming mode if supported
      ],
      {
        stdio: ["pipe", "pipe", "inherit"],
        cwd: path.dirname(whisperPath),
      },
    );

    // Set up audio streaming to Whisper
    this.#setupAudioPipeline();

    this.#proc.stdout.setEncoding("utf8");
    this.#proc.stdout.on("data", (data: string) => {
      this.#parseWhisperOutput(data);
    });

    this.#proc.on("exit", (code: any) => {
      console.warn("[WhisperSTT] Process exited with code:", code);
      this.emit("fatal", new Error(`whisper-exit-${code}`));
    });

    this.#proc.on("error", (err: any) => {
      console.error("[WhisperSTT] Process error:", err);
      this.emit("fatal", err);
    });
  }

  #setupAudioPipeline() {
    if (!this.#micStream || !this.#proc) return;

    // Use MediaRecorder to capture audio data
    // STUBBED: MediaRecorder not available in main process
    console.warn(
      "[WhisperSTT] MediaRecorder setup skipped - not available in main process",
    );
    return;
  }

  #parseWhisperOutput(data: string) {
    const lines = data.split("\n").filter((line) => line.trim());

    for (const line of lines) {
      try {
        // Try to parse as JSON first
        const obj = JSON.parse(line.trim()) as STTTranscript;
        if (obj.text && obj.text.trim()) {
          this.emit("transcript", obj);
        }
      } catch {
        // If not JSON, treat as plain text output
        const trimmed = line.trim();
        if (
          trimmed &&
          !trimmed.startsWith("[") &&
          !trimmed.startsWith("whisper.cpp")
        ) {
          this.emit("transcript", {
            text: trimmed,
            isFinal: true, // Whisper typically provides final results
          });
        }
      }
    }
  }

  #getWhisperPath(): string | null {
    // Check multiple possible locations for Whisper executable
    const possiblePaths = [
      // Bundled with the app
      path.join((process as any).resourcesPath || "", "whisper", "whisper.exe"),
      path.join((process as any).resourcesPath || "", "whisper", "whisper"),
      // System installation
      "whisper",
      "whisper.exe",
      // Common installation paths
      "C:\\Program Files\\whisper\\whisper.exe",
      "/usr/local/bin/whisper",
      "/opt/whisper/whisper",
    ];

    for (const whisperPath of possiblePaths) {
      try {
        // In a real implementation, you'd check if the file exists
        // For now, we'll assume the first bundled path
        if (whisperPath.includes("resources")) {
          return whisperPath;
        }
      } catch (err) {
        continue;
      }
    }

    // Fallback: try system PATH
    return process.platform === "win32" ? "whisper.exe" : "whisper";
  }

  #getModelPath(): string | null {
    // Check for model files
    const possibleModels = [
      // Bundled models
      path.join(
        (process as any).resourcesPath || "",
        "whisper",
        "ggml-tiny.en.bin",
      ),
      path.join(
        (process as any).resourcesPath || "",
        "whisper",
        "ggml-tiny.bin",
      ),
      path.join((process as any).resourcesPath || "", "whisper", "tiny.en.bin"),
      // Default model locations
      path.join(process.cwd(), "models", "ggml-tiny.en.bin"),
      // User's home directory
      path.join(require("os").homedir(), ".whisper", "ggml-tiny.en.bin"),
    ];

    for (const modelPath of possibleModels) {
      try {
        // In production, you'd check fs.existsSync(modelPath)
        // For now, return the first bundled model path
        if (modelPath.includes("resources")) {
          return modelPath;
        }
      } catch (err) {
        continue;
      }
    }

    // If no model found, this will cause Whisper to fail and trigger fallback
    return null;
  }
}
