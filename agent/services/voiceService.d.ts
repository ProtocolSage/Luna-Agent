import { Voices, VoiceName } from "../voice/voices";
export interface VoiceConfig {
  apiKey: string;
  voiceId?: string;
}
export interface SpeakOptions {
  interrupt?: boolean;
  priority?: number;
}
export declare class VoiceService {
  private voiceEngine;
  private queue;
  constructor(config: VoiceConfig);
  initialize(): Promise<void>;
  /**
   * Speak text with priority queue and caching support
   */
  speak(text: string, options?: SpeakOptions): Promise<void>;
  /**
   * Switch voice on the fly
   */
  switchVoice(
    name: VoiceName,
    options?: {
      interrupt?: boolean;
    },
  ): void;
  /**
   * Get current voice ID
   */
  getCurrentVoiceId(): string;
  /**
   * Get available voices
   */
  getAvailableVoices(): typeof Voices;
  /**
   * Get queue status
   */
  getQueueStatus(): {
    size: number;
  };
  /**
   * Graceful shutdown
   */
  destroy(): Promise<void>;
  /**
   * Stop any currently playing audio and clear queue
   */
  stop(): void;
}
export declare function initializeVoiceService(
  config: VoiceConfig,
): VoiceService;
export declare function getVoiceService(): VoiceService;
