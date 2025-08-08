/**
 * Voice Service - Bridges IPC communication with Audio Service
 * Handles TTS playback and voice interactions between main and renderer processes
 */

import { getAudioService, AudioService } from './AudioService';
import { getVoiceInputService, VoiceInputService } from './VoiceInputService';
import { errorHandler } from './ErrorHandler';

declare global {
  interface Window {
    voiceIPC?: {
      send: <T = any>(ch: string, data: T) => void;
      on: <T = any>(ch: string, cb: (data: T) => void) => void;
      invoke: <T = any>(ch: string, ...args: any[]) => Promise<T>;
      speak: (text: string, options?: any) => Promise<any>;
      chatWithTTS: (message: string) => Promise<any>;
      startListening: () => void;
      stopListening: () => void;
      getState: () => Promise<any>;
      onTTSAudioData: (cb: (data: ArrayBuffer) => void) => void;
      onTTSStarted: (cb: () => void) => void;
      onTTSStopped: (cb: () => void) => void;
      onTTSError: (cb: (error: string) => void) => void;
    };
    stt?: {
      start: () => Promise<{ success: boolean; error?: string }>;
      stop: () => Promise<{ success: boolean; error?: string }>;
      getStatus: () => Promise<{ currentEngine: string; isCloud: boolean; isLocal: boolean; isStarted: boolean; error?: string }>;
      switchToCloud: () => Promise<{ success: boolean; error?: string }>;
      switchToWhisper: () => Promise<{ success: boolean; error?: string }>;
      healthCheck: () => Promise<{ currentEngine: string; isHealthy: boolean; error?: string }>;
      onTranscript: (cb: (transcript: { text: string; isFinal: boolean }) => void) => void;
      onEngineSwitch: (cb: (info: { engine: string; isCloud: boolean }) => void) => void;
    };
  }
}

export class VoiceService {
  private audioService: AudioService;
  private voiceInputService: VoiceInputService;
  private isInitialized: boolean = false;
  private isSpeaking: boolean = false;
  private audioQueue: ArrayBuffer[] = [];
  private isProcessingQueue: boolean = false;

  constructor() {
    this.audioService = getAudioService();
    this.voiceInputService = getVoiceInputService();
    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    if (!window.voiceIPC) {
      console.error('VoiceIPC not available');
      return;
    }

    // Listen for TTS audio data from main process
    window.voiceIPC.onTTSAudioData(async (audioData: ArrayBuffer) => {
      console.log('Received TTS audio data:', audioData.byteLength, 'bytes');
      await this.playAudio(audioData);
    });

    // Listen for TTS started event
    window.voiceIPC.onTTSStarted(() => {
      console.log('TTS started');
      this.isSpeaking = true;
      this.emit('tts-started');
    });

    // Listen for stop playback command
    window.voiceIPC.onTTSStopped(() => {
      console.log('TTS stop requested');
      this.stopAudio();
    });

    // Listen for TTS errors
    window.voiceIPC.onTTSError((error: string) => {
      console.error('TTS error:', error);
      this.emit('tts-error', error);
    });

    // Listen for audio service events
    this.audioService.on('playback-ended', () => {
      this.isSpeaking = false;
      this.emit('tts-ended');
      this.processAudioQueue();
    });

    this.audioService.on('playback-started', () => {
      this.isSpeaking = true;
      this.emit('tts-playing');
    });

    // Set up voice input event listeners
    this.voiceInputService.on('recording-started', () => {
      this.emit('listening-started');
    });

    this.voiceInputService.on('recording-stopped', () => {
      this.emit('listening-stopped');
    });

    this.voiceInputService.on('transcription', (result: any) => {
      this.emit('transcription', result);
    });

    this.voiceInputService.on('volume-level', (level: number) => {
      this.emit('volume-level', level);
    });

    this.voiceInputService.on('error', (error: any) => {
      const errorMessage = typeof error === 'string' ? error : error?.message || 'Voice input error';
      this.emit('voice-input-error', errorMessage);
    });

    this.voiceInputService.on('network-error', (errorData: any) => {
      this.emit('network-error', errorData);
    });

    this.voiceInputService.on('offline-mode-enabled', (message: string) => {
      this.emit('offline-mode-enabled', message);
    });

    this.voiceInputService.on('circuit-breaker-reset', (message: string) => {
      this.emit('circuit-breaker-reset', message);
    });
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      // Initialize voice input service for speech recognition
      await this.voiceInputService.initialize();
      
      this.isInitialized = true;
      console.log('Voice service initialized');
    } catch (error) {
      console.error('Failed to initialize voice service:', error);
      throw error;
    }
  }

  async speak(text: string, options?: { interrupt?: boolean; voice?: string }): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      // Stop current audio if interrupting
      if (options?.interrupt) {
        this.stopAudio();
        this.clearAudioQueue();
      }

      // Request TTS from main process
      const result = await window.voiceIPC.speak(text, options);
      
      if (!result.success) {
        throw new Error(result.error || 'TTS failed');
      }

      // Audio data will be received via IPC event listener
    } catch (error) {
      const voiceError = errorHandler.handleTTSError(error as Error);
      this.emit('tts-error', voiceError.message);
      throw voiceError;
    }
  }

  async chatWithTTS(message: string): Promise<string> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      const result = await window.voiceIPC.chatWithTTS(message);
      
      if (!result.success) {
        throw new Error(result.error || 'Chat failed');
      }

      if (result.response) {
        // Automatically speak the response
        await this.speak(result.response);
        return result.response;
      }

      return '';
    } catch (error) {
      console.error('Chat with TTS error:', error);
      throw error;
    }
  }

  private async playAudio(audioData: ArrayBuffer): Promise<void> {
    // Add to queue if currently playing
    if (this.isSpeaking && !this.audioService.isCurrentlyPlaying()) {
      this.audioQueue.push(audioData);
      if (!this.isProcessingQueue) {
        this.processAudioQueue();
      }
      return;
    }

    try {
      await this.audioService.playAudioBuffer(audioData);
    } catch (error) {
      console.error('Failed to play audio:', error);
      this.emit('tts-error', (error as Error).message);
    }
  }

  private async processAudioQueue(): Promise<void> {
    if (this.isProcessingQueue || this.audioQueue.length === 0) {
      return;
    }

    this.isProcessingQueue = true;

    while (this.audioQueue.length > 0) {
      const audioData = this.audioQueue.shift();
      if (audioData) {
        try {
          await this.audioService.playAudioBuffer(audioData);
        } catch (error) {
          console.error('Failed to play queued audio:', error);
        }
      }
    }

    this.isProcessingQueue = false;
  }

  stopAudio(): void {
    this.audioService.stop();
    this.clearAudioQueue();
    this.isSpeaking = false;
    this.emit('tts-stopped');
  }

  private clearAudioQueue(): void {
    this.audioQueue = [];
    this.isProcessingQueue = false;
  }

  async startListening(): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }
    
    try {
      await this.voiceInputService.startListening();
    } catch (error) {
      console.error('Failed to start listening:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.emit('voice-input-error', errorMessage);
    }
  }

  async stopListening(): Promise<void> {
    try {
      await this.voiceInputService.stopListening();
    } catch (error) {
      console.error('Failed to stop listening:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.emit('voice-input-error', errorMessage);
    }
  }

  setVolume(volume: number): void {
    this.audioService.setVolume(volume);
  }

  getVolume(): number {
    return this.audioService.getVolume();
  }

  isCurrentlySpeaking(): boolean {
    return this.isSpeaking;
  }

  isCurrentlyListening(): boolean {
    return this.voiceInputService.isCurrentlyListening();
  }

  setVolumeCallback(callback: (level: number) => void): void {
    this.voiceInputService.setVolumeCallback(callback);
  }

  // Network and retry methods
  async retryVoiceInput(): Promise<void> {
    try {
      await this.voiceInputService.retryListening();
    } catch (error) {
      console.error('Failed to retry voice input:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.emit('voice-input-error', errorMessage);
    }
  }

  getVoiceInputStatus(): { 
    lastError: string | null; 
    retryInfo: { current: number; max: number; canRetry: boolean } 
  } {
    return {
      lastError: this.voiceInputService.getLastError(),
      retryInfo: this.voiceInputService.getRetryInfo()
    };
  }

  // Event emitter functionality
  private eventListeners: Map<string, Array<(...args: any[]) => void>> = new Map();

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
      listeners.forEach(listener => {
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
    this.stopAudio();
    this.voiceInputService.destroy();
    this.eventListeners.clear();
  }
}

// Singleton instance
let voiceService: VoiceService | null = null;

export function getVoiceService(): VoiceService {
  if (!voiceService) {
    voiceService = new VoiceService();
  }
  return voiceService;
}

export function destroyVoiceService(): void {
  if (voiceService) {
    voiceService.destroy();
    voiceService = null;
  }
}