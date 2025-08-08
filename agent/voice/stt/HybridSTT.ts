import { EventEmitter } from 'events';
import { CloudSTT } from './CloudSTT';
import { WhisperSTT } from './WhisperSTT';
import type { STTEngine, STTTranscript } from './STTEngine';

export class HybridSTT extends EventEmitter implements STTEngine {
  #engine: STTEngine;
  #preferLocal: boolean;
  #isStarted: boolean = false;

  constructor(preferLocal = false) {
    super();
    this.#preferLocal = preferLocal;
    this.#engine = preferLocal ? new WhisperSTT() : new CloudSTT();
    this.#wire(this.#engine);
  }

  async start() { 
    if (this.#isStarted) return;
    this.#isStarted = true;
    console.log(`[HybridSTT] Starting with ${this.#engine.constructor.name}`);
    await this.#engine.start(); 
  }

  async stop() { 
    this.#isStarted = false;
    await this.#engine.stop();  
  }

  getCurrentEngine(): string {
    return this.#engine.constructor.name;
  }

  isUsingCloud(): boolean {
    return this.#engine instanceof CloudSTT;
  }

  isUsingWhisper(): boolean {
    return this.#engine instanceof WhisperSTT;
  }

  // Manual switching (useful for testing or user preference)
  async switchToCloud(): Promise<void> {
    if (this.#engine instanceof CloudSTT) return;
    await this.#switchEngine(new CloudSTT());
  }

  async switchToWhisper(): Promise<void> {
    if (this.#engine instanceof WhisperSTT) return;
    await this.#switchEngine(new WhisperSTT());
  }

  /* ---------- internal ---------- */

  #wire(engine: STTEngine) {
    engine.on('transcript', (t) => {
      // Forward transcript events with engine info
      this.emit('transcript', t);
    });
    
    engine.on('fatal', (e) => {
      console.warn(`[HybridSTT] ${engine.constructor.name} failed:`, e.message);
      this.#swap(e);
    });
  }

  async #swap(err: Error) {
    const currentEngine = this.#engine.constructor.name;
    
    // PREVENT ENDLESS LOOP: If both engines fail with the same error, stop switching
    if (err.message.includes('getUserMedia')) {
      console.error('[HybridSTT] CRITICAL: getUserMedia not available in main process context');
      console.error('[HybridSTT] STT system must run in renderer process where browser APIs exist');
      this.#isStarted = false;
      this.emit('fatal', new Error('STT system incompatible with main process - needs renderer process'));
      return;
    }
    
    const next = this.#engine instanceof CloudSTT
      ? new WhisperSTT()           // cloud → whisper
      : new CloudSTT();            // whisper → cloud (we'll retry)

    console.log(`[HybridSTT] Switching from ${currentEngine} to ${next.constructor.name} due to: ${err.message}`);
    
    await this.#switchEngine(next);
  }

  async #switchEngine(newEngine: STTEngine): Promise<void> {
    // Stop current engine
    try {
      await this.#engine.stop();
    } catch (err) {
      console.warn('[HybridSTT] Error stopping previous engine:', err);
    }

    // Switch to new engine
    this.#engine = newEngine;
    this.#wire(newEngine);

    // Start new engine if we were running
    if (this.#isStarted) {
      try {
        await newEngine.start();
        console.log(`[HybridSTT] Successfully switched to ${newEngine.constructor.name}`);
        this.emit('engine-switched', {
          engine: newEngine.constructor.name,
          isCloud: newEngine instanceof CloudSTT
        });
      } catch (startErr) {
        console.error(`[HybridSTT] Failed to start ${newEngine.constructor.name}:`, startErr);
        // This will emit fatal and trigger another swap
      }
    }
  }

  // Health check method
  async checkHealth(): Promise<{
    currentEngine: string;
    isHealthy: boolean;
    error?: string;
  }> {
    const engineName = this.#engine.constructor.name;
    
    try {
      // For CloudSTT, we could add a health check method
      // For now, we assume it's healthy if it's not throwing errors
      return {
        currentEngine: engineName,
        isHealthy: true
      };
    } catch (error: any) {
      return {
        currentEngine: engineName,
        isHealthy: false,
        error: error.message
      };
    }
  }

  // Get status information
  getStatus(): {
    currentEngine: string;
    isCloud: boolean;
    isLocal: boolean;
    isStarted: boolean;
    preferLocal: boolean;
  } {
    return {
      currentEngine: this.#engine.constructor.name,
      isCloud: this.#engine instanceof CloudSTT,
      isLocal: this.#engine instanceof WhisperSTT,
      isStarted: this.#isStarted,
      preferLocal: this.#preferLocal
    };
  }
}
