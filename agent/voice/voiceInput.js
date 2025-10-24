"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VoiceInput = void 0;
exports.initializeVoiceInput = initializeVoiceInput;
exports.getVoiceInput = getVoiceInput;
const events_1 = require("events");
const axios_1 = require("axios");
class VoiceInput extends events_1.EventEmitter {
  constructor(config) {
    super();
    this.isRecording = false;
    this.volumeInterval = null;
    this.silenceTimeout = null;
    this.silenceTimer = null;
    this.recognition = null; // For Web Speech API
    this.currentProvider = null;
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
  async initialize() {
    await this.initializeSTTProvider();
  }
  async initializeSTTProvider() {
    const provider = this.config.provider || "webSpeech";
    switch (provider) {
      case "webSpeech":
        if (!this.isWebSpeechAvailable()) {
          // Use NotSupportedSTTProvider stub instead of throwing
          const { NotSupportedSTTProvider } = await Promise.resolve().then(() =>
            require("./notSupportedSTTProvider"),
          );
          const stub = new NotSupportedSTTProvider();
          stub.start();
          // Optionally, attach stub events to this VoiceInput for API compatibility
          stub.on("error", (err) => this.emit("error", err));
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
  isWebSpeechAvailable() {
    return (
      typeof window !== "undefined" &&
      ("SpeechRecognition" in window || "webkitSpeechRecognition" in window)
    );
  }
  async initializeWebSpeech() {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      throw new Error("Web Speech API not supported in this browser");
    }
    this.recognition = new SpeechRecognition();
    this.recognition.continuous = this.config.continuous;
    this.recognition.interimResults = this.config.interimResults;
    this.recognition.maxAlternatives = this.config.maxAlternatives;
    this.recognition.lang = this.config.language;
    this.recognition.onresult = (event) => {
      const result = event.results[event.results.length - 1];
      const transcription = {
        text: result[0].transcript,
        confidence: result[0].confidence || 1,
        isFinal: result.isFinal,
        alternatives: Array.from(result).map((alt) => ({
          text: alt.transcript,
          confidence: alt.confidence || 0,
        })),
        timestamp: Date.now(),
      };
      this.emit("transcription", transcription);
    };
    this.recognition.onerror = (event) => {
      this.emit("error", new Error(`Speech recognition error: ${event.error}`));
    };
    this.recognition.onend = () => {
      if (this.isRecording && this.config.continuous) {
        this.recognition.start();
      }
    };
  }
  async startRecording() {
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
  async startAudioRecording() {
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
        new Error(`Microphone access failed: ${error.message}`),
      );
    }
  }
  setupVolumeAnalysis(stream) {
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
  handleLowVolume() {
    if (!this.silenceTimer) {
      this.silenceTimer = setTimeout(() => {
        if (this.isRecording) {
          console.log("Silence detected - stopping recording");
          this.handleSilence();
        }
      }, this.config.silenceDuration || 1500);
    }
  }
  resetSilenceTimer() {
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }
  }
  handleSilence() {
    // Simulate silence detection
    console.log("Silence detected");
    this.stopRecording();
  }
  async stopRecording() {
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
  async processAudioBuffer() {
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
  async transcribeWithWhisper(audioBuffer) {
    try {
      // Simplified Whisper transcription for browser environment
      const blob = new Blob([audioBuffer], { type: "audio/wav" });
      const formData = new FormData();
      formData.append("file", blob, "audio.wav");
      formData.append("model", "whisper-1");
      formData.append("language", this.config.language || "en");
      const response = await axios_1.default.post(
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
    } catch (error) {
      console.error("Whisper transcription failed:", error);
      throw new Error(`Whisper transcription failed: ${error.message}`);
    }
  }
  async transcribeWithAzure(audioBuffer) {
    try {
      // Azure Speech Services REST API implementation
      const region = process.env.AZURE_SPEECH_REGION;
      const key = process.env.AZURE_SPEECH_KEY;
      if (!region || !key) {
        throw new Error("Azure Speech credentials not configured");
      }
      const response = await axios_1.default.post(
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
    } catch (error) {
      console.error("Azure transcription failed:", error);
      throw new Error(`Azure transcription failed: ${error.message}`);
    }
  }
  async transcribeWithGoogle(audioBuffer) {
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
      const response = await axios_1.default.post(
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
    } catch (error) {
      console.error("Google transcription failed:", error);
      throw new Error(`Google transcription failed: ${error.message}`);
    }
  }
  async transcribeFile(filePath) {
    // Simplified file transcription for browser environment
    // In Electron, this would use fs module through IPC
    throw new Error("File transcription not yet implemented");
  }
  setLanguage(language) {
    this.config.language = language;
    if (this.recognition) {
      this.recognition.lang = language;
    }
  }
  getConfig() {
    return { ...this.config };
  }
  destroy() {
    this.stopRecording();
    this.removeAllListeners();
    if (this.recognition) {
      this.recognition = null;
    }
  }
}
exports.VoiceInput = VoiceInput;
// Export singleton instance with factory function
let voiceInputInstance = null;
function initializeVoiceInput(config) {
  if (!voiceInputInstance) {
    voiceInputInstance = new VoiceInput(config);
  }
  return voiceInputInstance;
}
function getVoiceInput() {
  return voiceInputInstance;
}
//# sourceMappingURL=voiceInput.js.map
