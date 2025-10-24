// WakeWordService.ts - Simple wake word detection with automatic fallback
import { logger } from "../utils/logger";

export interface WakeWordOptions {
  accessKey?: string;
  onDetection: (phrase: string) => void;
  keywords?: string[];
  useFallback?: boolean;
}

export class WakeWordService {
  private recognition: any = null;
  private isListening: boolean = false;
  private onDetection: (phrase: string) => void;
  private keywords: string[];

  constructor(options: WakeWordOptions) {
    this.onDetection = options.onDetection;
    this.keywords = options.keywords || ["hey luna", "luna"];

    // Initialize Web Speech API (fallback or primary)
    this.initializeWebSpeech();
  }

  private initializeWebSpeech() {
    try {
      const SpeechRecognition =
        (window as any).webkitSpeechRecognition ||
        (window as any).SpeechRecognition;

      if (!SpeechRecognition) {
        logger.warn("Web Speech API not available");
        return;
      }

      this.recognition = new SpeechRecognition();
      this.recognition.continuous = true;
      this.recognition.interimResults = true;
      this.recognition.lang = "en-US";

      this.recognition.onresult = (event: any) => {
        try {
          const transcript =
            event.results[event.results.length - 1][0].transcript.toLowerCase();

          // Check for any of the keywords
          for (const keyword of this.keywords) {
            if (transcript.includes(keyword)) {
              logger.info(`Wake word detected: "${keyword}"`);
              this.onDetection(keyword);

              // Restart listening after a short delay
              this.stop();
              setTimeout(() => {
                if (this.isListening) {
                  this.start();
                }
              }, 2000);
              break;
            }
          }
        } catch (error) {
          logger.error("Error processing speech result:", error);
        }
      };

      this.recognition.onerror = (event: any) => {
        logger.warn("Speech recognition error:", event.error);

        // Restart on recoverable errors
        if (event.error === "no-speech" || event.error === "aborted") {
          setTimeout(() => {
            if (this.isListening) {
              this.start();
            }
          }, 1000);
        }
      };

      this.recognition.onend = () => {
        // Restart if we should still be listening
        if (this.isListening) {
          logger.debug("Speech recognition ended, restarting...");
          setTimeout(() => this.start(), 500);
        }
      };

      logger.info("Web Speech API initialized successfully");
    } catch (error) {
      logger.error("Failed to initialize Web Speech API:", error);
    }
  }

  async initialize(accessKey?: string): Promise<boolean> {
    // First try Porcupine if we have an access key
    if (accessKey && (await this.checkPorcupineAssets())) {
      try {
        // This would integrate with PorcupineClient
        logger.info(
          "Porcupine assets found, but using Web Speech API for simplicity",
        );
        return true;
      } catch (error) {
        logger.warn("Porcupine initialization failed, using Web Speech API");
      }
    }

    // Use Web Speech API
    return this.recognition !== null;
  }

  private async checkPorcupineAssets(): Promise<boolean> {
    try {
      const requiredAssets = [
        "assets/porcupine_worker.js",
        "assets/pv_porcupine.wasm",
      ];

      for (const asset of requiredAssets) {
        const response = await fetch(asset, { method: "HEAD" });
        if (!response.ok) {
          return false;
        }
      }

      return true;
    } catch (error) {
      return false;
    }
  }

  async start(): Promise<void> {
    if (!this.recognition) {
      logger.error("Wake word service not initialized");
      return;
    }

    if (this.isListening) {
      logger.debug("Already listening");
      return;
    }

    try {
      await this.requestMicrophonePermission();
      this.recognition.start();
      this.isListening = true;
      logger.info("Wake word listening started");
    } catch (error: any) {
      if (error.message && error.message.includes("already started")) {
        logger.debug("Recognition already started");
        this.isListening = true;
      } else {
        logger.error("Failed to start wake word listening:", error);
        throw error;
      }
    }
  }

  stop(): void {
    if (!this.recognition) {
      return;
    }

    this.isListening = false;

    try {
      this.recognition.stop();
      logger.info("Wake word listening stopped");
    } catch (error) {
      logger.debug(
        "Error stopping recognition (may be already stopped):",
        error,
      );
    }
  }

  isActive(): boolean {
    return this.isListening;
  }

  private async requestMicrophonePermission(): Promise<void> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Immediately stop the stream - we just needed to trigger permission
      stream.getTracks().forEach((track) => track.stop());
    } catch (error) {
      logger.error("Microphone permission denied:", error);
      throw new Error("Microphone access is required for wake word detection");
    }
  }

  destroy(): void {
    this.stop();
    this.recognition = null;
  }
}

// Singleton instance management
let serviceInstance: WakeWordService | null = null;

export function getWakeWordService(options?: WakeWordOptions): WakeWordService {
  if (!serviceInstance && options) {
    serviceInstance = new WakeWordService(options);
  }

  if (!serviceInstance) {
    throw new Error(
      "WakeWordService not initialized. Please provide options on first call.",
    );
  }

  return serviceInstance;
}

export function destroyWakeWordService(): void {
  if (serviceInstance) {
    serviceInstance.destroy();
    serviceInstance = null;
  }
}
