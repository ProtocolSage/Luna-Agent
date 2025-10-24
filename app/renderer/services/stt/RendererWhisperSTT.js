"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RendererWhisperSTT = void 0;
const events_1 = require("events");
class RendererWhisperSTT extends events_1.EventEmitter {
  constructor() {
    super();
    this.name = "RendererWhisperSTT";
    this.isOnlineService = false;
    this._isListening = false;
    this.initialized = false;
    this.audioContext = null;
    this.stream = null;
    this.setMaxListeners(20);
  }
  async initialize(config) {
    this.initialized = true;
    console.log("RendererWhisperSTT initialized with config:", config);
  }
  async startListening() {
    await this.start();
  }
  async stopListening() {
    await this.stop();
  }
  isListening() {
    return this._isListening;
  }
  isInitialized() {
    return this.initialized;
  }
  setLanguage(language) {
    console.log("Language set to:", language);
  }
  destroy() {
    this.stop();
    this.removeAllListeners();
  }
  getCapabilities() {
    return {
      streamingSupport: true,
      offlineSupport: true,
      languageDetection: false,
      punctuation: true,
      profanityFilter: false,
    };
  }
  checkHealth() {
    return Promise.resolve({
      healthy: this.initialized,
      latency: 100,
    });
  }
  async start() {
    if (this._isListening) return;
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.audioContext = new (window.AudioContext ||
        window.webkitAudioContext)();
      this._isListening = true;
      this.emit("listening_started");
      // Placeholder for Whisper STT implementation
      // In production, this would integrate with the actual Whisper model
      setTimeout(() => {
        this.emit("transcript", {
          text: "Sample transcription from Whisper STT",
          isFinal: true,
          confidence: 0.95,
        });
      }, 1000);
    } catch (error) {
      this.emit("error", error);
    }
  }
  async stop() {
    if (!this._isListening) return;
    try {
      if (this.stream) {
        this.stream.getTracks().forEach((track) => track.stop());
        this.stream = null;
      }
      if (this.audioContext) {
        await this.audioContext.close();
        this.audioContext = null;
      }
      this._isListening = false;
      this.emit("listening_stopped");
    } catch (error) {
      this.emit("error", error);
    }
  }
  isActive() {
    return this.isListening();
  }
  getStatus() {
    return {
      isListening: this.isListening(),
      engine: "whisper",
    };
  }
}
exports.RendererWhisperSTT = RendererWhisperSTT;
//# sourceMappingURL=RendererWhisperSTT.js.map
