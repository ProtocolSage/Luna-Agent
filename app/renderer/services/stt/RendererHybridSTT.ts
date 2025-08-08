/**
 * Renderer-Based Hybrid STT Service
 * Manages STT in renderer process where browser APIs work properly
 */

import { RendererCloudSTT } from './RendererCloudSTT';
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
  private fallbackToWebSpeech: boolean = false;
  private webSpeechRecognition: any = null;
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
      
      // Try cloud STT first
      await this.initializeCloudSTT();
      
      return { success: true };
    } catch (error: any) {
      console.warn('[RendererHybridSTT] Cloud STT failed, falling back to Web Speech');
      this.lastError = error.message;
      
      // Fallback to enhanced Web Speech with better error handling
      try {
        await this.initializeWebSpeechFallback();
        return { success: true };
      } catch (webSpeechError: any) {
        this.isStarted = false;
        const errorMsg = `All STT systems failed. Cloud: ${error.message}. WebSpeech: ${webSpeechError.message}`;
        console.error('[RendererHybridSTT]', errorMsg);
        return { success: false, error: errorMsg };
      }
    }
  }

  async stop(): Promise<{ success: boolean; error?: string }> {
    try {
      this.isStarted = false;
      
      // Stop cloud STT
      if (this.currentEngine) {
        await this.currentEngine.stopListening();
      }
      
      // Stop Web Speech fallback
      if (this.webSpeechRecognition) {
        try {
          this.webSpeechRecognition.stop();
        } catch (err) {
          // Ignore errors when stopping
        }
      }
      
      this.emit('listening-stopped');
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  private async initializeCloudSTT(): Promise<void> {
    try {
      this.currentEngine = new RendererCloudSTT();
      
      // Set up event forwarding
      this.currentEngine.on('transcription', (result: TranscriptionResult) => {
        this.emit('transcript', { text: result.text, isFinal: result.isFinal });
      });

      this.currentEngine.on('recording-started', () => {
        this.emit('listening-started');
        this.emit('engine-switched', { engine: 'CloudSTT', isCloud: true });
      });

      this.currentEngine.on('recording-stopped', () => {
        this.emit('listening-stopped');
      });

      this.currentEngine.on('error', (error: string) => {
        console.error('[RendererHybridSTT] Cloud STT error:', error);
        this.lastError = error;
        this.emit('error', error);
        
        // Don't auto-switch if we're already switching
        if (!this.switchingInProgress) {
          this.switchToWebSpeechFallback();
        }
      });

      // Initialize and start
      await this.currentEngine.initialize({});
      await this.currentEngine.startListening();
      
      console.log('[RendererHybridSTT] Cloud STT started successfully');
      
    } catch (error: any) {
      console.error('[RendererHybridSTT] Failed to initialize cloud STT:', error);
      throw error;
    }
  }

  private async initializeWebSpeechFallback(): Promise<void> {
    if (!this.isWebSpeechAvailable()) {
      throw new Error('Web Speech API not supported');
    }

    const SpeechRecognition = (window as any).SpeechRecognition || 
                             (window as any).webkitSpeechRecognition;
    
    this.webSpeechRecognition = new SpeechRecognition();
    this.webSpeechRecognition.continuous = true;
    this.webSpeechRecognition.interimResults = true;
    this.webSpeechRecognition.lang = 'en-US';

    this.webSpeechRecognition.onresult = (event: any) => {
      const result = event.results[event.results.length - 1];
      this.emit('transcript', {
        text: result[0].transcript,
        isFinal: result.isFinal
      });
    };

    this.webSpeechRecognition.onerror = (event: any) => {
      console.error('[RendererHybridSTT] Web Speech error:', event.error);
      
      if (event.error === 'network') {
        // Stop the error loop immediately
        this.webSpeechRecognition.stop();
        this.emit('error', 'Web Speech network error - voice recognition stopped');
        return;
      }
      
      this.emit('error', `Web Speech error: ${event.error}`);
    };

    this.webSpeechRecognition.onstart = () => {
      console.log('[RendererHybridSTT] Web Speech started');
      this.fallbackToWebSpeech = true;
      this.emit('listening-started');
      this.emit('engine-switched', { engine: 'WebSpeech', isCloud: false });
    };

    this.webSpeechRecognition.onend = () => {
      console.log('[RendererHybridSTT] Web Speech ended');
      // Don't auto-restart to prevent loops
    };

    // Start Web Speech
    this.webSpeechRecognition.start();
  }

  private async switchToWebSpeechFallback(): Promise<void> {
    if (this.switchingInProgress || this.fallbackToWebSpeech) return;
    
    this.switchingInProgress = true;
    
    try {
      console.log('[RendererHybridSTT] Switching to Web Speech fallback');
      
      // Stop cloud STT
      if (this.currentEngine) {
        await this.currentEngine.stopListening();
        this.currentEngine = null;
      }
      
      // Start Web Speech fallback
      await this.initializeWebSpeechFallback();
      
    } catch (error: any) {
      console.error('[RendererHybridSTT] Failed to switch to Web Speech:', error);
      this.emit('error', `Failed to switch to Web Speech: ${error.message}`);
    } finally {
      this.switchingInProgress = false;
    }
  }

  private isWebSpeechAvailable(): boolean {
    return typeof window !== 'undefined' && (
      'SpeechRecognition' in window || 
      'webkitSpeechRecognition' in window
    );
  }

  // Public status methods
  getStatus(): {
    currentEngine: string;
    isCloud: boolean;
    isLocal: boolean;
    isStarted: boolean;
    lastError: string | null;
  } {
    return {
      currentEngine: this.fallbackToWebSpeech ? 'WebSpeech' : (this.currentEngine?.name || 'None'),
      isCloud: !this.fallbackToWebSpeech && !!this.currentEngine,
      isLocal: this.fallbackToWebSpeech,
      isStarted: this.isStarted,
      lastError: this.lastError
    };
  }

  async switchToCloud(): Promise<{ success: boolean; error?: string }> {
    try {
      if (this.currentEngine && !this.fallbackToWebSpeech) {
        return { success: true }; // Already using cloud
      }

      // Stop current engine
      await this.stop();
      this.fallbackToWebSpeech = false;
      
      // Start cloud STT
      await this.initializeCloudSTT();
      
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  async switchToWebSpeech(): Promise<{ success: boolean; error?: string }> {
    try {
      if (this.fallbackToWebSpeech) {
        return { success: true }; // Already using Web Speech
      }

      // Stop current engine
      await this.stop();
      
      // Start Web Speech
      await this.initializeWebSpeechFallback();
      
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  async healthCheck(): Promise<{ currentEngine: string; isHealthy: boolean; error?: string }> {
    const status = this.getStatus();
    
    try {
      if (this.currentEngine) {
        const health = await this.currentEngine.checkHealth();
        return {
          currentEngine: status.currentEngine,
          isHealthy: health.healthy,
          error: health.error
        };
      } else {
        return {
          currentEngine: status.currentEngine,
          isHealthy: this.fallbackToWebSpeech && this.isWebSpeechAvailable(),
          error: this.fallbackToWebSpeech ? undefined : 'No STT engine active'
        };
      }
    } catch (error: any) {
      return {
        currentEngine: status.currentEngine,
        isHealthy: false,
        error: error.message
      };
    }
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
