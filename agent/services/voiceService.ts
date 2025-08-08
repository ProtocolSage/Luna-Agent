import { VoiceEngine } from '../voice/voiceEngine';
import { PriorityQueue } from '../voice/priorityQueue';
import { Voices, VoiceName } from '../voice/voices';

export interface VoiceConfig {
  apiKey: string;
  voiceId?: string; // Optional since we use Nova Westbrook by default
}

export interface SpeakOptions {
  interrupt?: boolean;
  priority?: number;
}

export class VoiceService {
  private voiceEngine: VoiceEngine;
  private queue: PriorityQueue;

  constructor(config: VoiceConfig) {
    // VoiceEngine handles all the configuration internally
    this.voiceEngine = new VoiceEngine();
    
    // Initialize priority queue with voice engine's playText method
    this.queue = new PriorityQueue((text: string) => this.voiceEngine.playText(text));
  }

  async initialize(): Promise<void> {
    // No initialization needed for the new voice engine
    console.log('🎤 Voice service initialized with Nova Westbrook streaming engine');
  }

  /**
   * Speak text with priority queue and caching support
   */
  async speak(text: string, options: SpeakOptions = {}): Promise<void> {
    const { interrupt = false, priority = 0 } = options;
    
    if (interrupt) {
      // Clear queue and interrupt current playback
      this.queue.clear();
      await this.voiceEngine.destroy();
    }
    
    return this.queue.enqueue(text, priority);
  }

  /**
   * Switch voice on the fly
   */
  switchVoice(name: VoiceName, options: { interrupt?: boolean } = {}): void {
    this.voiceEngine.switchVoice(name, options);
  }

  /**
   * Get current voice ID
   */
  getCurrentVoiceId(): string {
    return this.voiceEngine.getCurrentVoiceId();
  }

  /**
   * Get available voices
   */
  getAvailableVoices(): typeof Voices {
    return Voices;
  }

  /**
   * Get queue status
   */
  getQueueStatus(): { size: number } {
    return { size: this.queue.size() };
  }

  /**
   * Graceful shutdown
   */
  async destroy(): Promise<void> {
    this.queue.clear();
    await this.voiceEngine.destroy();
  }

  /**
   * Stop any currently playing audio and clear queue
   */
  stop(): void {
    this.queue.clear();
    this.voiceEngine.destroy();
  }
}

// Singleton instance
let voiceService: VoiceService | null = null;

export function initializeVoiceService(config: VoiceConfig): VoiceService {
  voiceService = new VoiceService(config);
  return voiceService;
}

export function getVoiceService(): VoiceService {
  if (!voiceService) {
    throw new Error('VoiceService not initialized. Call initializeVoiceService first.');
  }
  return voiceService;
}
