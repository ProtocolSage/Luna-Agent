/**
 * Audio Service for Web Audio API playback in Electron renderer process
 * Replaces native speaker module with browser-compatible audio playback
 */

import { errorHandler } from "./ErrorHandler";

export class AudioService {
  private audioContext: AudioContext | null = null;
  private currentAudioBuffer: AudioBuffer | null = null;
  private currentSource: AudioBufferSourceNode | null = null;
  private isPlaying: boolean = false;
  private volume: number = 1.0;

  constructor() {
    this.initializeAudioContext();
  }

  private initializeAudioContext(): void {
    try {
      this.audioContext = new (window.AudioContext ||
        (window as any).webkitAudioContext)();
    } catch (error) {
      console.error("Failed to initialize AudioContext:", error);
    }
  }

  async playAudioBuffer(arrayBuffer: ArrayBuffer): Promise<void> {
    if (!this.audioContext) {
      throw new Error("AudioContext not initialized");
    }

    try {
      // Stop any currently playing audio
      this.stop();

      // Resume AudioContext if suspended
      if (this.audioContext.state === "suspended") {
        await this.audioContext.resume();
      }

      // Decode audio data
      this.currentAudioBuffer =
        await this.audioContext.decodeAudioData(arrayBuffer);

      // Create audio source
      this.currentSource = this.audioContext.createBufferSource();
      this.currentSource.buffer = this.currentAudioBuffer;

      // Create gain node for volume control
      const gainNode = this.audioContext.createGain();
      gainNode.gain.value = this.volume;

      // Connect audio graph: source -> gain -> destination
      this.currentSource.connect(gainNode);
      gainNode.connect(this.audioContext.destination);

      // Set up event listeners
      this.currentSource.addEventListener("ended", () => {
        this.isPlaying = false;
        this.currentSource = null;
        this.emit("playback-ended");
      });

      // Start playback
      this.currentSource.start(0);
      this.isPlaying = true;
      this.emit("playback-started");

      return new Promise<void>((resolve, reject) => {
        if (this.currentSource) {
          this.currentSource.addEventListener("ended", () => resolve());
          this.currentSource.addEventListener("error", () =>
            reject(new Error("Audio playback error")),
          );
        } else {
          reject(new Error("Audio source not created"));
        }
      });
    } catch (error) {
      this.isPlaying = false;
      const voiceError = errorHandler.handleAudioPlaybackError(error as Error);
      throw voiceError;
    }
  }

  stop(): void {
    if (this.currentSource && this.isPlaying) {
      try {
        this.currentSource.stop();
        this.currentSource.disconnect();
      } catch (error) {
        console.error("Error stopping audio:", error);
      }
      this.currentSource = null;
      this.isPlaying = false;
      this.emit("playback-stopped");
    }
  }

  setVolume(volume: number): void {
    this.volume = Math.max(0, Math.min(1, volume));
  }

  getVolume(): number {
    return this.volume;
  }

  isCurrentlyPlaying(): boolean {
    return this.isPlaying;
  }

  // Event emitter functionality
  private eventListeners: Map<string, Array<(...args: any[]) => void>> =
    new Map();

  on(event: string, listener: (...args: any[]) => void): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event)!.push(listener);
  }

  off(event: string, listener: (...args: any[]) => void): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      const index = listeners.indexOf(listener);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    }
  }

  private emit(event: string, ...args: any[]): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.forEach((listener) => {
        try {
          listener(...args);
        } catch (error) {
          console.error(`Error in event listener for ${event}:`, error);
        }
      });
    }
  }

  // Cleanup
  destroy(): void {
    this.stop();
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
    this.eventListeners.clear();
  }
}

// Singleton instance
let audioService: AudioService | null = null;

export function getAudioService(): AudioService {
  if (!audioService) {
    audioService = new AudioService();
  }
  return audioService;
}

export function destroyAudioService(): void {
  if (audioService) {
    audioService.destroy();
    audioService = null;
  }
}
