"use strict";
/**
 * Renderer-Based Hybrid STT Service
 * Manages STT in renderer process where browser APIs work properly
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.RendererHybridSTT = void 0;
exports.getRendererHybridSTT = getRendererHybridSTT;
exports.destroyRendererHybridSTT = destroyRendererHybridSTT;
const RendererCloudSTT_1 = require("./RendererCloudSTT");
const RendererWhisperSTT_1 = require("./RendererWhisperSTT");
class RendererHybridSTT {
    constructor() {
        this.currentEngine = null;
        this.isStarted = false;
        this.eventListeners = new Map();
        this.whisperSTT = null;
        this.cloudSTT = null;
        this.switchingInProgress = false;
        this.lastError = null;
        console.log('[RendererHybridSTT] Initializing in renderer process');
    }
    async start() {
        if (this.isStarted) {
            return { success: true };
        }
        try {
            this.isStarted = true;
            // Check if we have cloud STT credentials
            const env = window.__ENV || {};
            const hasCloudCredentials = env.AZURE_SPEECH_KEY || env.DEEPGRAM_API_KEY;
            if (hasCloudCredentials) {
                // Try cloud STT first if credentials exist
                try {
                    await this.initializeCloudSTT();
                    return { success: true };
                }
                catch (cloudError) {
                    console.warn('[RendererHybridSTT] Cloud STT failed:', cloudError.message);
                    this.lastError = cloudError.message;
                    // Fall through to Whisper
                }
            }
            else {
                console.log('[RendererHybridSTT] No cloud credentials found, defaulting to Whisper STT');
            }
            // Fallback to Whisper (OpenAI) if cloud fails or no cloud credentials
            console.log('[RendererHybridSTT] Using OpenAI Whisper STT');
            try {
                await this.initializeWhisperSTT();
                return { success: true };
            }
            catch (whisperError) {
                console.error('[RendererHybridSTT] All STT engines failed');
                this.isStarted = false;
                this.lastError = whisperError.message;
                return {
                    success: false,
                    error: `Both Cloud and Whisper STT failed: ${this.lastError}`
                };
            }
        }
        catch (error) {
            this.isStarted = false;
            return { success: false, error: error.message };
        }
    }
    async stop() {
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
            this.emit('listening-stopped', undefined);
            return { success: true };
        }
        catch (error) {
            return { success: false, error: error.message };
        }
    }
    async initializeCloudSTT() {
        this.cloudSTT = new RendererCloudSTT_1.RendererCloudSTT();
        await this.cloudSTT.initialize({
            language: 'en-US',
            continuous: true,
            interimResults: true
        });
        console.log('[RendererHybridSTT] Initialized cloud STT');
        this.cloudSTT.on('transcription', (result) => {
            this.emit('transcript', { text: result.text, isFinal: result.isFinal });
        });
        this.cloudSTT.on('error', (error) => {
            console.error('[RendererHybridSTT] Cloud STT error:', error);
            this.emit('error', error);
        });
        await this.cloudSTT.startListening();
        this.currentEngine = this.cloudSTT;
        this.emit('engine-switched', { engine: 'CloudSTT', isCloud: true });
    }
    async initializeWhisperSTT() {
        this.whisperSTT = new RendererWhisperSTT_1.RendererWhisperSTT();
        await this.whisperSTT.initialize({
            language: 'en-US',
            continuous: true,
            interimResults: true
        });
        console.log('[RendererHybridSTT] Initialized Whisper STT');
        this.whisperSTT.on('transcription', (result) => {
            this.emit('transcript', { text: result.text, isFinal: result.isFinal });
        });
        this.whisperSTT.on('error', (error) => {
            console.error('[RendererHybridSTT] Whisper STT error:', error);
            this.emit('error', error);
        });
        await this.whisperSTT.start();
        this.currentEngine = this.whisperSTT;
        this.emit('engine-switched', { engine: 'WhisperSTT', isCloud: false });
    }
    async switchToWhisperFallback() {
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
        }
        catch (error) {
            console.error('[RendererHybridSTT] Failed to switch to Whisper:', error);
            this.emit('error', `Failed to switch to Whisper: ${error.message}`);
        }
        finally {
            this.switchingInProgress = false;
        }
    }
    // Removed duplicate - see public switchToCloud below
    // Public status methods
    getStatus() {
        return {
            engine: this.currentEngine === this.whisperSTT ? 'WhisperSTT' :
                (this.currentEngine === this.cloudSTT ? 'CloudSTT' : 'None'),
            isCloud: this.currentEngine === this.cloudSTT,
            isLocal: this.currentEngine === this.whisperSTT,
            isStarted: this.isStarted,
            lastError: this.lastError
        };
    }
    async switchToCloud() {
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
        }
        catch (error) {
            console.error('[RendererHybridSTT] Failed to switch to cloud:', error);
            this.emit('error', `Failed to switch to cloud: ${error.message}`);
            // Fallback to Whisper if cloud fails
            await this.switchToWhisperFallback();
        }
        finally {
            this.switchingInProgress = false;
        }
    }
    async switchToWhisper() {
        if (this.currentEngine === this.whisperSTT) {
            console.log('[RendererHybridSTT] Already using Whisper STT');
            return;
        }
        console.log('[RendererHybridSTT] Switching to Whisper STT...');
        await this.switchToWhisperFallback();
    }
    async healthCheck() {
        const hasWhisperKey = !!window.__ENV?.OPENAI_API_KEY;
        const hasCloudKey = !!window.__ENV?.AZURE_SPEECH_KEY || !!window.__ENV?.DEEPGRAM_API_KEY;
        const status = this.getStatus();
        const healthy = !!this.currentEngine && (this.currentEngine.isListening() || this.currentEngine.isInitialized());
        if (!healthy && (hasWhisperKey || hasCloudKey)) {
            // Try to auto-recover
            try {
                if (hasCloudKey) {
                    await this.initializeCloudSTT();
                }
                else if (hasWhisperKey) {
                    await this.switchToWhisperFallback();
                }
            }
            catch (error) {
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
    on(event, listener) {
        if (!this.eventListeners.has(event)) {
            this.eventListeners.set(event, []);
        }
        this.eventListeners.get(event).push(listener);
    }
    off(event, listener) {
        const listeners = this.eventListeners.get(event);
        if (listeners) {
            const index = listeners.indexOf(listener);
            if (index > -1) {
                listeners.splice(index, 1);
            }
        }
    }
    emit(event, data) {
        const listeners = this.eventListeners.get(event);
        if (listeners) {
            listeners.forEach(listener => {
                try {
                    listener(data);
                }
                catch (error) {
                    console.error(`[RendererHybridSTT] Error in event listener for ${event}:`, error);
                }
            });
        }
    }
    destroy() {
        this.stop().catch(console.error);
        this.eventListeners.clear();
        console.log('[RendererHybridSTT] Destroyed');
    }
}
exports.RendererHybridSTT = RendererHybridSTT;
// Singleton instance for renderer process
let rendererHybridSTT = null;
function getRendererHybridSTT() {
    if (!rendererHybridSTT) {
        rendererHybridSTT = new RendererHybridSTT();
    }
    return rendererHybridSTT;
}
function destroyRendererHybridSTT() {
    if (rendererHybridSTT) {
        rendererHybridSTT.destroy();
        rendererHybridSTT = null;
    }
}
//# sourceMappingURL=RendererHybridSTT.js.map