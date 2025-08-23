"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConversationManager = void 0;
exports.initializeConversationManager = initializeConversationManager;
exports.getConversationManager = getConversationManager;
const events_1 = require("events");
const voiceInput_1 = require("./voiceInput");
const voiceService_1 = require("../services/voiceService");
class ConversationManager extends events_1.EventEmitter {
    constructor(config = {}) {
        super();
        this.voiceInput = null;
        this.wakeWordActive = false;
        this.vadActive = false;
        this.audioStream = null;
        this.responseTimer = null;
        this.silenceTimer = null;
        this.config = {
            wakeWord: process.env.WAKE_WORD || 'luna',
            autoListen: process.env.VOICE_AUTO_LISTEN === 'true',
            voiceActivityDetection: process.env.VOICE_ACTIVITY_DETECTION === 'true',
            interruptionEnabled: true,
            maxSilenceDuration: 2000,
            responseTimeout: 30000,
            sttProvider: process.env.STT_PROVIDER || 'webSpeech',
            apiKey: process.env.OPENAI_API_KEY,
            ...config
        };
        this.state = {
            isListening: false,
            isSpeaking: false,
            isProcessing: false,
            currentTranscript: '',
            conversationHistory: [],
            lastInteractionTime: Date.now()
        };
        this.voiceEngine = (0, voiceService_1.getVoiceService)();
    }
    async initialize() {
        try {
            // Initialize voice input
            this.voiceInput = (0, voiceInput_1.initializeVoiceInput)({
                provider: this.config.sttProvider,
                apiKey: this.config.apiKey,
                language: 'en-US',
                continuous: true,
                interimResults: true
            });
            await this.voiceInput.initialize();
            this.setupVoiceInputListeners();
            // Initialize wake word detection if enabled
            if (this.config.wakeWord) {
                await this.initializeWakeWord();
            }
            // Initialize voice activity detection if enabled  
            if (this.config.voiceActivityDetection) {
                await this.initializeVAD();
            }
            // Start auto-listening if enabled
            if (this.config.autoListen) {
                await this.startListening();
            }
            this.emit('initialized');
        }
        catch (error) {
            this.emit('error', error);
            throw error;
        }
    }
    setupVoiceInputListeners() {
        if (!this.voiceInput)
            return;
        this.voiceInput.on('transcription', async (result) => {
            if (result.isFinal) {
                this.state.currentTranscript = result.text;
                this.emit('transcription', result);
                // Process the transcription
                await this.processUserInput(result.text);
            }
            else {
                // Handle interim results
                this.emit('interim-transcription', result);
            }
        });
        this.voiceInput.on('recording-started', () => {
            this.state.isListening = true;
            this.emit('listening-started');
        });
        this.voiceInput.on('recording-stopped', () => {
            this.state.isListening = false;
            this.emit('listening-stopped');
        });
        this.voiceInput.on('error', (error) => {
            this.emit('error', error);
        });
    }
    async initializeWakeWord() {
        try {
            // Simplified wake word detection using browser speech recognition
            // In production, this would use a proper wake word detection service
            console.log(`Wake word detection enabled for: ${this.config.wakeWord}`);
            this.wakeWordActive = true;
            this.setupWakeWordDetection();
        }
        catch (error) {
            console.warn('Wake word detection initialization failed:', error);
            // Continue without wake word detection
        }
    }
    setupWakeWordDetection() {
        if (!this.wakeWordActive)
            return;
        // Use Web Speech API for wake word detection simulation
        // In a production environment, this would use a dedicated wake word service
        if (typeof window !== 'undefined' && 'webkitSpeechRecognition' in window) {
            const WakeWordRecognition = window.webkitSpeechRecognition || window.SpeechRecognition;
            const wakeRecognition = new WakeWordRecognition();
            wakeRecognition.continuous = true;
            wakeRecognition.interimResults = false;
            wakeRecognition.lang = 'en-US';
            wakeRecognition.onresult = (event) => {
                const transcript = event.results[event.results.length - 1][0].transcript.toLowerCase();
                if (transcript.includes(this.config.wakeWord.toLowerCase())) {
                    this.emit('wake-word-detected');
                    this.handleWakeWord();
                }
            };
            wakeRecognition.onerror = (error) => {
                console.warn('Wake word detection error:', error);
            };
            wakeRecognition.start();
        }
        else {
            console.warn('Web Speech API not available for wake word detection');
        }
    }
    async initializeVAD() {
        try {
            // Simplified VAD using audio level detection
            // In production, this would use WebRTC VAD or similar
            console.log('Voice Activity Detection enabled');
            this.vadActive = true;
        }
        catch (error) {
            console.warn('VAD initialization failed:', error);
        }
    }
    async handleWakeWord() {
        if (!this.state.isListening) {
            await this.startListening();
        }
    }
    async startListening() {
        if (this.state.isListening || !this.voiceInput) {
            return;
        }
        // Stop speaking if currently speaking (interruption)
        if (this.state.isSpeaking && this.config.interruptionEnabled) {
            await this.stopSpeaking();
        }
        await this.voiceInput.startRecording();
        // Set response timeout
        this.resetResponseTimer();
    }
    async stopListening() {
        if (!this.state.isListening || !this.voiceInput) {
            return;
        }
        await this.voiceInput.stopRecording();
        this.clearResponseTimer();
    }
    async processUserInput(text) {
        if (!text.trim()) {
            return;
        }
        this.state.isProcessing = true;
        this.emit('processing-started');
        // Add to conversation history
        this.state.conversationHistory.push({
            role: 'user',
            content: text,
            timestamp: Date.now()
        });
        try {
            // Send to agent for processing
            const response = await this.sendToAgent(text);
            // Add response to history
            this.state.conversationHistory.push({
                role: 'assistant',
                content: response,
                timestamp: Date.now()
            });
            // Speak the response
            await this.speak(response);
        }
        catch (error) {
            this.emit('error', error);
        }
        finally {
            this.state.isProcessing = false;
            this.emit('processing-stopped');
            // Continue listening if auto-listen is enabled
            if (this.config.autoListen && !this.state.isListening) {
                await this.startListening();
            }
        }
    }
    async sendToAgent(text) {
        // This would integrate with the agent's chat endpoint
        // For now, we'll emit an event for the application to handle
        return new Promise((resolve, reject) => {
            this.emit('agent-request', text, (response) => {
                if (response) {
                    resolve(response);
                }
                else {
                    reject(new Error('No response from agent'));
                }
            });
            // Timeout if no response
            setTimeout(() => {
                reject(new Error('Agent response timeout'));
            }, this.config.responseTimeout);
        });
    }
    async speak(text) {
        if (!text)
            return;
        this.state.isSpeaking = true;
        this.emit('speaking-started');
        try {
            await this.voiceEngine.playText(text);
        }
        catch (error) {
            this.emit('error', error);
        }
        finally {
            this.state.isSpeaking = false;
            this.emit('speaking-stopped');
        }
    }
    async stopSpeaking() {
        if (!this.state.isSpeaking) {
            return;
        }
        this.voiceEngine.stopSpeaking();
        this.state.isSpeaking = false;
        this.emit('speaking-interrupted');
    }
    resetResponseTimer() {
        this.clearResponseTimer();
        this.responseTimer = setTimeout(() => {
            this.stopListening();
            this.emit('response-timeout');
        }, this.config.responseTimeout);
    }
    clearResponseTimer() {
        if (this.responseTimer) {
            clearTimeout(this.responseTimer);
            this.responseTimer = null;
        }
    }
    resetSilenceTimer() {
        this.clearSilenceTimer();
        this.silenceTimer = setTimeout(() => {
            this.processEndOfSpeech();
        }, this.config.maxSilenceDuration);
    }
    clearSilenceTimer() {
        if (this.silenceTimer) {
            clearTimeout(this.silenceTimer);
            this.silenceTimer = null;
        }
    }
    async processEndOfSpeech() {
        await this.stopListening();
        if (this.state.currentTranscript) {
            await this.processUserInput(this.state.currentTranscript);
            this.state.currentTranscript = '';
        }
    }
    // Control methods
    async toggleListening() {
        if (this.state.isListening) {
            await this.stopListening();
        }
        else {
            await this.startListening();
        }
    }
    async pushToTalk(pressed) {
        if (pressed) {
            await this.startListening();
        }
        else {
            await this.stopListening();
        }
    }
    // State getters
    getState() {
        return { ...this.state };
    }
    getConversationHistory() {
        return [...this.state.conversationHistory];
    }
    clearHistory() {
        this.state.conversationHistory = [];
    }
    // Cleanup
    async destroy() {
        await this.stopListening();
        await this.stopSpeaking();
        if (this.voiceInput) {
            this.voiceInput.destroy();
            this.voiceInput = null;
        }
        // Clean up wake word and VAD flags
        this.wakeWordActive = false;
        this.vadActive = false;
        if (this.audioStream) {
            this.audioStream.stop();
            this.audioStream = null;
        }
        this.clearResponseTimer();
        this.clearSilenceTimer();
        this.removeAllListeners();
    }
}
exports.ConversationManager = ConversationManager;
// Export singleton instance
let conversationManagerInstance = null;
function initializeConversationManager(config) {
    if (!conversationManagerInstance) {
        conversationManagerInstance = new ConversationManager(config);
    }
    return conversationManagerInstance;
}
function getConversationManager() {
    return conversationManagerInstance;
}
//# sourceMappingURL=conversationManager.js.map