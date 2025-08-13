/**
 * Renderer-Based Hybrid STT Service
 * Manages STT in renderer process where browser APIs work properly
 */

import { RendererCloudSTT } from './RendererCloudSTT';
import { RendererWhisperSTT } from './RendererWhisperSTT';
import { STTProvider, TranscriptionResult } from './STTInterface';

interface RendererSTTEvents {
  'transcript': { text: string; isFinal: boolean };
  'engine-switched': { engine: string; isCloud: boolean };
  'error': string;
  'listening-started': void;
  'listening-stopped': void;
}

export class RendererHybridSTT {
  private currentEngine: STTProvider | null = null;
  private isStarted: boolean = false;
  private eventListeners: Map<string, Array<(...args: any[]) => void>> = new Map();
  private whisperSTT: RendererWhisperSTT | null = null;
  private cloudSTT: RendererCloudSTT | null = null;
  private switchingInProgress: boolean = false;
  private lastError: string | null = null;

  constructor() {
    console.log('[RendererHybridSTT] Initializing in renderer process');
  }

  async start(): Promise<{ success: boolean; error?: string }> {
    if (this.isStarted) {
      return { success: true };
    }

    try {
      this.isStarted = true;
      
      // Check if we have cloud STT credentials
      const env = (window as any).__ENV || {};
      const hasCloudCredentials = env.AZURE_SPEECH_KEY || env.DEEPGRAM_API_KEY;
      
      if (hasCloudCredentials) {
        // Try cloud STT first if credentials exist
        try {
          await this.initializeCloudSTT();
          return { success: true };
        } catch (cloudError: any) {
          console.warn('[RendererHybridSTT] Cloud STT failed:', cloudError.message);
          this.lastError = cloudError.message;
          // Fall through to Whisper
        }
      } else {
        console.log('[RendererHybridSTT] No cloud credentials found, defaulting to Whisper STT');
      }
      
      // Fallback to Whisper (OpenAI) if cloud fails or no cloud credentials
      console.log('[RendererHybridSTT] Using OpenAI Whisper STT');
      try {
        await this.initializeWhisperSTT();
        return { success: true };
      } catch (whisperError: any) {
        console.error('[RendererHybridSTT] All STT engines failed');
        this.isStarted = false;
        this.lastError = whisperError.message;
        return { 
          success: false, 
          error: `Both Cloud and Whisper STT failed: ${this.lastError}` 
        };
      }
    } catch (error: any) {
      this.isStarted = false;
      return { success: false, error: error.message };
    }
  }

  async stop(): Promise<{ success: boolean; error?: string }> {
    try {
      this.isStarted = false;
      
      // Stop current engine
      if (this.currentEngine) {
        await this.currentEngine.stopListening();
      }
      
      // Clean up any active engines
      if (this.cloudSTT) {
        await this.cloudSTT.stopListening();
      }
      if (this.whisperSTT) {
        await this.whisperSTT.stop();
      }
      
      this.emit('listening-stopped', undefined as any);
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  private async initializeCloudSTT(): Promise<void> {
    this.cloudSTT = new RendererCloudSTT();
    await this.cloudSTT.initialize({
      language: 'en-US',
      continuous: true,
      interimResults: true
    });

    console.log('[RendererHybridSTT] Initialized cloud STT');
    
    this.cloudSTT.on('transcription', (result: TranscriptionResult) => {
      this.emit('transcript', { text: result.text, isFinal: result.isFinal });
    });

    this.cloudSTT.on('error', (error: string) => {
      console.error('[RendererHybridSTT] Cloud STT error:', error);
      this.emit('error', error);
    });

    await this.cloudSTT.startListening();
    this.currentEngine = this.cloudSTT;
    this.emit('engine-switched', { engine: 'CloudSTT', isCloud: true });
  }

  private async initializeWhisperSTT(): Promise<void> {
    this.whisperSTT = new RendererWhisperSTT();
    await this.whisperSTT.initialize({
      language: 'en-US',
      continuous: true,
      interimResults: true
    });

    console.log('[RendererHybridSTT] Initialized Whisper STT');
    
    this.whisperSTT.on('transcription', (result: TranscriptionResult) => {
      this.emit('transcript', { text: result.text, isFinal: result.isFinal });
    });

    this.whisperSTT.on('error', (error: string) => {
      console.error('[RendererHybridSTT] Whisper STT error:', error);
      this.emit('error', error);
    });

    await this.whisperSTT.start();
    this.currentEngine = this.whisperSTT;
    this.emit('engine-switched', { engine: 'WhisperSTT', isCloud: false });
  }

  private async switchToWhisperFallback(): Promise<void> {
    if (this.switchingInProgress || this.currentEngine === this.whisperSTT) {
      return;
    }

    console.log('[RendererHybridSTT] Switching to Whisper fallback...');
    this.switchingInProgress = true;

    try {
      // Stop current engine
      if (this.currentEngine) {
        await this.currentEngine.stopListening();
        this.currentEngine = null;
      }

      // Initialize Whisper
      await this.initializeWhisperSTT();
      
    } catch (error: any) {
      console.error('[RendererHybridSTT] Failed to switch to Whisper:', error);
      this.emit('error', `Failed to switch to Whisper: ${error.message}`);
    } finally {
      this.switchingInProgress = false;
    }
  }

  // Removed duplicate - see public switchToCloud below

  // Public status methods
  getStatus(): {
    engine: string;
    isCloud: boolean;
    isLocal: boolean;
    isStarted: boolean;
    lastError: string | null;
  } {
    return {
      engine: this.currentEngine === this.whisperSTT ? 'WhisperSTT' : 
              (this.currentEngine === this.cloudSTT ? 'CloudSTT' : 'None'),
      isCloud: this.currentEngine === this.cloudSTT,
      isLocal: this.currentEngine === this.whisperSTT,
      isStarted: this.isStarted,
      lastError: this.lastError
    };
  }

  async switchToCloud(): Promise<void> {
    if (this.currentEngine === this.cloudSTT) {
      console.log('[RendererHybridSTT] Already using cloud STT');
      return;
    }

    console.log('[RendererHybridSTT] Switching to cloud STT...');
    this.switchingInProgress = true;

    try {
      // Stop current engine
      if (this.currentEngine) {
        await this.currentEngine.stopListening();
      }

      // Reinitialize cloud STT
      await this.initializeCloudSTT();
      
    } catch (error: any) {
      console.error('[RendererHybridSTT] Failed to switch to cloud:', error);
      this.emit('error', `Failed to switch to cloud: ${error.message}`);
      // Fallback to Whisper if cloud fails
      await this.switchToWhisperFallback();
    } finally {
      this.switchingInProgress = false;
    }
  }

  async switchToWhisper(): Promise<void> {
    if (this.currentEngine === this.whisperSTT) {
      console.log('[RendererHybridSTT] Already using Whisper STT');
      return;
    }

    console.log('[RendererHybridSTT] Switching to Whisper STT...');
    await this.switchToWhisperFallback();
  }

  async healthCheck(): Promise<{ healthy: boolean; details?: any }> {
    const hasWhisperKey = !!(window as any).__ENV?.OPENAI_API_KEY;
    const hasCloudKey = !!(window as any).__ENV?.AZURE_SPEECH_KEY || !!(window as any).__ENV?.DEEPGRAM_API_KEY;
    
    const status = this.getStatus();
    const healthy = !!this.currentEngine && (this.currentEngine.isListening() || this.currentEngine.isInitialized());
    
    if (!healthy && (hasWhisperKey || hasCloudKey)) {
      // Try to auto-recover
      try {
        if (hasCloudKey) {
          await this.initializeCloudSTT();
        } else if (hasWhisperKey) {
          await this.switchToWhisperFallback();
        }
      } catch (error) {
        console.error('[RendererHybridSTT] Auto-recovery failed:', error);
      }
    }
    
    return {
      healthy: !!this.currentEngine,
      details: {
        ...status,
        hasWhisperKey,
        hasCloudKey
      }
    };
  }

  // Event emitter methods
  on<K extends keyof RendererSTTEvents>(event: K, listener: (data: RendererSTTEvents[K]) => void): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event)!.push(listener as any);
  }

  off<K extends keyof RendererSTTEvents>(event: K, listener: (data: RendererSTTEvents[K]) => void): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      const index = listeners.indexOf(listener as any);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    }
  }

  private emit<K extends keyof RendererSTTEvents>(event: K, data: RendererSTTEvents[K]): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.forEach(listener => {
        try {
          listener(data);
        } catch (error) {
          console.error(`[RendererHybridSTT] Error in event listener for ${event}:`, error);
        }
      });
    }
  }

  destroy(): void {
    this.stop().catch(console.error);
    this.eventListeners.clear();
    console.log('[RendererHybridSTT] Destroyed');
  }
}

// Singleton instance for renderer process
let rendererHybridSTT: RendererHybridSTT | null = null;

export function getRendererHybridSTT(): RendererHybridSTT {
  if (!rendererHybridSTT) {
    rendererHybridSTT = new RendererHybridSTT();
  }
  return rendererHybridSTT;
}

export function destroyRendererHybridSTT(): void {
  if (rendererHybridSTT) {
    rendererHybridSTT.destroy();
    rendererHybridSTT = null;
  }
}
