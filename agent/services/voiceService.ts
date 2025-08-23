import { ElevenLabsService } from '../../backend/services/elevenLabsService';
import { PriorityQueue } from '../voice/priorityQueue';
import { Voices, VoiceName } from '../voice/voices';

export interface SpeakOptions {
  interrupt?: boolean;
  priority?: number;
}

export class VoiceService {
  private elevenLabsService: ElevenLabsService;
  private queue: PriorityQueue;

  constructor() {
    this.elevenLabsService = new ElevenLabsService();
    this.queue = new PriorityQueue((text: string) => this.elevenLabsService.playText(text));
  }

  async initialize(): Promise<void> {
    console.log('🎤 Voice service initialized');
  }

  async speak(text: string, options: SpeakOptions = {}): Promise<void> {
    const { interrupt = false, priority = 0 } = options;

    if (interrupt) {
      this.queue.clear();
      await this.elevenLabsService.destroy();
    }

    return this.queue.enqueue(text, priority);
  }

  switchVoice(name: VoiceName, options: { interrupt?: boolean } = {}): void {
    this.elevenLabsService.switchVoice(name, options);
  }

  getCurrentVoiceId(): string {
    return this.elevenLabsService.getCurrentVoiceId();
  }

  getAvailableVoices(): typeof Voices {
    return Voices;
  }

  getQueueStatus(): { size: number } {
    return { size: this.queue.size() };
  }

  async destroy(): Promise<void> {
    this.queue.clear();
    await this.elevenLabsService.destroy();
  }

  stop(): void {
    this.queue.clear();
    this.elevenLabsService.destroy();
  }
}

let voiceService: VoiceService | null = null;

export function initializeVoiceService(): VoiceService {
  voiceService = new VoiceService();
  return voiceService;
}

export function getVoiceService(): VoiceService {
  if (!voiceService) {
    throw new Error('VoiceService not initialized. Call initializeVoiceService first.');
  }
  return voiceService;
}
