import { EventEmitter } from "events";
import axios from "axios";
import { Readable } from "stream";

interface VoiceInputConfig {
  provider: "webSpeech" | "whisper" | "azure" | "google";
  apiKey?: string;
  language?: string;
  continuous?: boolean;
  interimResults?: boolean;
  maxAlternatives?: number;
  sampleRate?: number;
  silenceThreshold?: number;
  silenceDuration?: number;
}

interface TranscriptionResult {
  text: string;
  confidence: number;
  isFinal: boolean;
  alternatives?: Array<{ text: string; confidence: number }>;
  timestamp?: number;
}

export class VoiceInput extends EventEmitter {
  private config: VoiceInputConfig;
  private isRecording: boolean = false;
  private volumeInterval: NodeJS.Timeout | null = null;
  private silenceTimeout: NodeJS.Timeout | null = null;
  private silenceTimer: NodeJS.Timeout | null = null;
  private recognition: any = null; // For Web Speech API
  private currentProvider: string | null = null;

  constructor(config: VoiceInputConfig) {
    super();
    this.config = {
      language: "en-US",
      continuous: true,
      interimResults: true,
      maxAlternatives: 1,
      sampleRate: 16000,
      silenceThreshold: 1000,
      silenceDuration: 1500,
      ...config,
    };
  }

  async initialize(): Promise<void> {
    await this.initializeSTTProvider();
  }

  private async initializeSTTProvider(): Promise<void> {
    const provider = this.config.provider || "webSpeech";

    switch (provider) {
      case "webSpeech":
        if (!this.isWebSpeechAvailable()) {
          // Use NotSupportedSTTProvider stub instead of throwing
          const { NotSupportedSTTProvider } = await import(
            "./notSupportedSTTProvider"
          );
          const stub = new NotSupportedSTTProvider();
          stub.start();
          // Optionally, attach stub events to this VoiceInput for API compatibility
          stub.on("error", (err: Error) => this.emit("error", err));
          this.currentProvider = "notSupported";
          return;
        }
        break;
      case "whisper":
        if (!process.env.OPENAI_API_KEY) {
          throw new Error("OPENAI_API_KEY is required for Whisper STT");
        }
        break;
      case "azure":
        if (!process.env.AZURE_SPEECH_KEY || !process.env.AZURE_SPEECH_REGION) {
          throw new Error("Azure Speech credentials are required");
        }
        break;
      case "google":
        if (!process.env.GOOGLE_CLOUD_CREDENTIALS) {
          throw new Error("Google Cloud credentials are required");
        }
        break;
      default:
        throw new Error(`Unsupported STT provider: ${provider}`);
    }

    this.currentProvider = provider;
  }

  private isWebSpeechAvailable(): boolean {
    return (
      typeof window !== "undefined" &&
      ("SpeechRecognition" in window || "webkitSpeechRecognition" in window)
    );
  }

  private async initializeWebSpeech(): Promise<void> {
    const SpeechRecognition =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      throw new Error("Web Speech API not supported in this browser");
    }

    this.recognition = new SpeechRecognition();
    this.recognition.continuous = this.config.continuous;
    this.recognition.interimResults = this.config.interimResults;
    this.recognition.maxAlternatives = this.config.maxAlternatives;
    this.recognition.lang = this.config.language;

    this.recognition.onresult = (event: any) => {
      const result = event.results[event.results.length - 1];
      const transcription: TranscriptionResult = {
        text: result[0].transcript,
        confidence: result[0].confidence || 1,
        isFinal: result.isFinal,
        alternatives: Array.from(result).map((alt: any) => ({
          text: alt.transcript,
          confidence: alt.confidence || 0,
        })),
        timestamp: Date.now(),
      };
      this.emit("transcription", transcription);
    };

    this.recognition.onerror = (event: any) => {
      this.emit("error", new Error(`Speech recognition error: ${event.error}`));
    };

    this.recognition.onend = () => {
      if (this.isRecording && this.config.continuous) {
        this.recognition.start();
      }
    };
  }

  async startRecording(): Promise<void> {
    if (this.isRecording) {
      return;
    }

    this.isRecording = true;
    this.emit("recording-started");

    if (
      this.currentProvider === "webspeech" ||
      this.currentProvider === "webSpeech"
    ) {
      await this.initializeWebSpeech();
      this.recognition.start();
    } else {
      await this.startAudioRecording();
    }
  }

  private async startAudioRecording(): Promise<void> {
    try {
      console.log("Starting browser-based audio recording...");

      // Get microphone access
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: this.config.sampleRate,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      // Set up audio analysis for volume detection
      this.setupVolumeAnalysis(stream);

      // For other STT providers, we would set up MediaRecorder here
      // For now, we'll rely on Web Speech API for the actual transcription

      console.log("Audio recording started successfully");
    } catch (error) {
      console.error("Failed to start audio recording:", error);
      this.emit(
        "error",
        new Error(`Microphone access failed: ${(error as Error).message}`),
      );
    }
  }

  private setupVolumeAnalysis(stream: MediaStream): void {
    try {
      const audioContext = new AudioContext();
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();

      analyser.fftSize = 256;
      source.connect(analyser);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      // Emit periodic volume levels for UI visualization
      this.volumeInterval = setInterval(() => {
        if (this.isRecording) {
          analyser.getByteFrequencyData(dataArray);

          // Calculate volume level
          let sum = 0;
          for (let i = 0; i < dataArray.length; i++) {
            sum += dataArray[i];
          }
          const volume = sum / (dataArray.length * 255); // Normalize to 0-1

          this.emit("volumeLevel", volume);

          // Simple voice activity detection
          if (volume < 0.01) {
            this.handleLowVolume();
          } else {
            this.resetSilenceTimer();
          }
        }
      }, 100);
    } catch (error) {
      console.error("Failed to setup volume analysis:", error);
    }
  }

  private handleLowVolume(): void {
    if (!this.silenceTimer) {
      this.silenceTimer = setTimeout(() => {
        if (this.isRecording) {
          console.log("Silence detected - stopping recording");
          this.handleSilence();
        }
      }, this.config.silenceDuration || 1500);
    }
  }

  private resetSilenceTimer(): void {
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }
  }

  private handleSilence(): void {
    // Simulate silence detection
    console.log("Silence detected");
    this.stopRecording();
  }

  async stopRecording(): Promise<void> {
    if (!this.isRecording) {
      return;
    }

    this.isRecording = false;

    if (this.recognition) {
      this.recognition.stop();
    }

    if (this.volumeInterval) {
      clearInterval(this.volumeInterval);
      this.volumeInterval = null;
    }
    if (this.silenceTimeout) {
      clearTimeout(this.silenceTimeout);
      this.silenceTimeout = null;
    }

    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }

    this.emit("recording-stopped");
  }

  async processAudioBuffer(): Promise<void> {
    // Simplified audio processing
    try {
      let transcription = "";

      switch (this.currentProvider) {
        case "webspeech":
        case "webSpeech":
          // Web Speech API handles its own transcription
          return;
        case "whisper":
          // Simulate Whisper transcription
          transcription = await this.transcribeWithWhisper(new ArrayBuffer(0));
          break;
        case "azure":
          // Simulate Azure transcription
          transcription = await this.transcribeWithAzure(new ArrayBuffer(0));
          break;
        case "google":
          // Simulate Google transcription
          transcription = await this.transcribeWithGoogle(new ArrayBuffer(0));
          break;
      }

      if (transcription) {
        this.emit("transcription", transcription);
      }
    } catch (error) {
      console.error("Transcription error:", error);
      this.emit("error", error);
    }
  }

  private async transcribeWithWhisper(
    audioBuffer: ArrayBuffer,
  ): Promise<string> {
    try {
      // Simplified Whisper transcription for browser environment
      const blob = new Blob([audioBuffer], { type: "audio/wav" });
      const formData = new FormData();
      formData.append("file", blob, "audio.wav");
      formData.append("model", "whisper-1");
      formData.append("language", this.config.language || "en");

      const response = await axios.post(
        "https://api.openai.com/v1/audio/transcriptions",
        formData,
        {
          headers: {
            Authorization: `Bearer ${this.config.apiKey || process.env.OPENAI_API_KEY}`,
            "Content-Type": "multipart/form-data",
          },
          timeout: 30000,
        },
      );

      return response.data.text;
    } catch (error: any) {
      console.error("Whisper transcription failed:", error);
      throw new Error(`Whisper transcription failed: ${error.message}`);
    }
  }

  private async transcribeWithAzure(audioBuffer: ArrayBuffer): Promise<string> {
    try {
      // Azure Speech Services REST API implementation
      const region = process.env.AZURE_SPEECH_REGION;
      const key = process.env.AZURE_SPEECH_KEY;

      if (!region || !key) {
        throw new Error("Azure Speech credentials not configured");
      }

      const response = await axios.post(
        `https://${region}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1`,
        audioBuffer,
        {
          headers: {
            "Ocp-Apim-Subscription-Key": key,
            "Content-Type": "audio/wav; codecs=audio/pcm; samplerate=16000",
            Accept: "application/json",
          },
          params: {
            language: this.config.language || "en-US",
            format: "detailed",
          },
          timeout: 30000,
        },
      );

      if (response.data.RecognitionStatus === "Success") {
        return response.data.DisplayText;
      } else {
        throw new Error(`Azure STT failed: ${response.data.RecognitionStatus}`);
      }
    } catch (error: any) {
      console.error("Azure transcription failed:", error);
      throw new Error(`Azure transcription failed: ${error.message}`);
    }
  }

  private async transcribeWithGoogle(
    audioBuffer: ArrayBuffer,
  ): Promise<string> {
    try {
      // Google Cloud Speech-to-Text REST API implementation
      const apiKey = process.env.GOOGLE_CLOUD_API_KEY;

      if (!apiKey) {
        throw new Error("Google Cloud API key not configured");
      }

      // Convert ArrayBuffer to base64
      const audioBytes = Array.from(new Uint8Array(audioBuffer))
        .map((b) => String.fromCharCode(b))
        .join("");
      const base64Audio = btoa(audioBytes);

      const response = await axios.post(
        `https://speech.googleapis.com/v1/speech:recognize?key=${apiKey}`,
        {
          config: {
            encoding: "WEBM_OPUS",
            sampleRateHertz: this.config.sampleRate || 16000,
            languageCode: this.config.language || "en-US",
            enableAutomaticPunctuation: true,
          },
          audio: {
            content: base64Audio,
          },
        },
        {
          headers: {
            "Content-Type": "application/json",
          },
          timeout: 30000,
        },
      );

      if (response.data.results && response.data.results.length > 0) {
        return response.data.results[0].alternatives[0].transcript;
      } else {
        throw new Error("No transcription results from Google");
      }
    } catch (error: any) {
      console.error("Google transcription failed:", error);
      throw new Error(`Google transcription failed: ${error.message}`);
    }
  }

  async transcribeFile(filePath: string): Promise<TranscriptionResult> {
    // Simplified file transcription for browser environment
    // In Electron, this would use fs module through IPC
    throw new Error("File transcription not yet implemented");
  }

  setLanguage(language: string): void {
    this.config.language = language;
    if (this.recognition) {
      this.recognition.lang = language;
    }
  }

  getConfig(): VoiceInputConfig {
    return { ...this.config };
  }

  destroy(): void {
    this.stopRecording();
    this.removeAllListeners();
    if (this.recognition) {
      this.recognition = null;
    }
  }
}

// Export singleton instance with factory function
let voiceInputInstance: VoiceInput | null = null;

export function initializeVoiceInput(config: VoiceInputConfig): VoiceInput {
  if (!voiceInputInstance) {
    voiceInputInstance = new VoiceInput(config);
  }
  return voiceInputInstance;
}

export function getVoiceInput(): VoiceInput | null {
  return voiceInputInstance;
}
