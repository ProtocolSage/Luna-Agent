"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VoiceService = void 0;
exports.initializeVoiceService = initializeVoiceService;
exports.getVoiceService = getVoiceService;
const voiceEngine_1 = require("../voice/voiceEngine");
const priorityQueue_1 = require("../voice/priorityQueue");
const voices_1 = require("../voice/voices");
class VoiceService {
    constructor(config) {
        // VoiceEngine handles all the configuration internally
        this.voiceEngine = new voiceEngine_1.VoiceEngine();
        // Initialize priority queue with voice engine's playText method
        this.queue = new priorityQueue_1.PriorityQueue((text) => this.voiceEngine.playText(text));
    }
    async initialize() {
        // No initialization needed for the new voice engine
        console.log('🎤 Voice service initialized with Nova Westbrook streaming engine');
    }
    /**
     * Speak text with priority queue and caching support
     */
    async speak(text, options = {}) {
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
    switchVoice(name, options = {}) {
        this.voiceEngine.switchVoice(name, options);
    }
    /**
     * Get current voice ID
     */
    getCurrentVoiceId() {
        return this.voiceEngine.getCurrentVoiceId();
    }
    /**
     * Get available voices
     */
    getAvailableVoices() {
        return voices_1.Voices;
    }
    /**
     * Get queue status
     */
    getQueueStatus() {
        return { size: this.queue.size() };
    }
    /**
     * Graceful shutdown
     */
    async destroy() {
        this.queue.clear();
        await this.voiceEngine.destroy();
    }
    /**
     * Stop any currently playing audio and clear queue
     */
    stop() {
        this.queue.clear();
        this.voiceEngine.destroy();
    }
}
exports.VoiceService = VoiceService;
// Singleton instance
let voiceService = null;
function initializeVoiceService(config) {
    voiceService = new VoiceService(config);
    return voiceService;
}
function getVoiceService() {
    if (!voiceService) {
        throw new Error('VoiceService not initialized. Call initializeVoiceService first.');
    }
    return voiceService;
}
//# sourceMappingURL=voiceService.js.map