import { EventEmitter } from 'events';
import { VoiceInput, initializeVoiceInput } from './voiceInput';
import { VoiceEngine } from './voiceEngine';
import { getVoiceService } from '../services/voiceService';

interface ConversationConfig {
  wakeWord?: string;
  autoListen?: boolean;
  voiceActivityDetection?: boolean;
  interruptionEnabled?: boolean;
  maxSilenceDuration?: number;
  responseTimeout?: number;
  sttProvider?: 'webSpeech' | 'whisper' | 'azure' | 'google' | 'dummy';
  apiKey?: string;
}

interface ConversationState {
  isListening: boolean;
  isSpeaking: boolean;
  isProcessing: boolean;
  currentTranscript: string;
  conversationHistory: Array<{
    role: 'user' | 'assistant';
    content: string;
    timestamp: number;
  }>;
  lastInteractionTime: number;
}

export class ConversationManager extends EventEmitter {
  private config: ConversationConfig;
  private state: ConversationState;
  private voiceInput: VoiceInput | null = null;
  private voiceEngine: any; // VoiceService instance
  private wakeWordActive: boolean = false;
  private vadActive: boolean = false;
  private audioStream: any = null;
  private responseTimer: NodeJS.Timeout | null = null;
  private silenceTimer: NodeJS.Timeout | null = null;

  constructor(config: ConversationConfig = {}) {
    super();
    this.config = {
      wakeWord: process.env.WAKE_WORD || 'luna',
      autoListen: process.env.VOICE_AUTO_LISTEN === 'true',
      voiceActivityDetection: process.env.VOICE_ACTIVITY_DETECTION === 'true',
      interruptionEnabled: true,
      maxSilenceDuration: 2000,
      responseTimeout: 30000,
      sttProvider: (process.env.STT_PROVIDER as any) || 'webSpeech',
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

    this.voiceEngine = getVoiceService();
  }

  async initialize(): Promise<void> {
    try {
      // Initialize voice input
      this.voiceInput = initializeVoiceInput({
        provider: this.config.sttProvider!,
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
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  private setupVoiceInputListeners(): void {
    if (!this.voiceInput) return;

    this.voiceInput.on('transcription', async (result) => {
      if (result.isFinal) {
        this.state.currentTranscript = result.text;
        this.emit('transcription', result);
        
        // Process the transcription
        await this.processUserInput(result.text);
      } else {
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

  private async initializeWakeWord(): Promise<void> {
    try {
      // Simplified wake word detection using browser speech recognition
      // In production, this would use a proper wake word detection service
      console.log(`Wake word detection enabled for: ${this.config.wakeWord}`);
      this.wakeWordActive = true;
      this.setupWakeWordDetection();
    } catch (error) {
      console.warn('Wake word detection initialization failed:', error);
      // Continue without wake word detection
    }
  }

  private setupWakeWordDetection(): void {
    if (!this.wakeWordActive) return;

    // Use Web Speech API for wake word detection simulation
    // In a production environment, this would use a dedicated wake word service
    if (typeof window !== 'undefined' && 'webkitSpeechRecognition' in window) {
      const WakeWordRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
      const wakeRecognition = new WakeWordRecognition();
      wakeRecognition.continuous = true;
      wakeRecognition.interimResults = false;
      wakeRecognition.lang = 'en-US';

      wakeRecognition.onresult = (event: any) => {
        const transcript = event.results[event.results.length - 1][0].transcript.toLowerCase();
        if (transcript.includes(this.config.wakeWord!.toLowerCase())) {
          this.emit('wake-word-detected');
          this.handleWakeWord();
        }
      };

      wakeRecognition.onerror = (error: any) => {
        console.warn('Wake word detection error:', error);
      };

      wakeRecognition.start();
    } else {
      console.warn('Web Speech API not available for wake word detection');
    }
  }

  private async initializeVAD(): Promise<void> {
    try {
      // Simplified VAD using audio level detection
      // In production, this would use WebRTC VAD or similar
      console.log('Voice Activity Detection enabled');
      this.vadActive = true;
    } catch (error) {
      console.warn('VAD initialization failed:', error);
    }
  }

  private async handleWakeWord(): Promise<void> {
    if (!this.state.isListening) {
      await this.startListening();
    }
  }

  async startListening(): Promise<void> {
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

  async stopListening(): Promise<void> {
    if (!this.state.isListening || !this.voiceInput) {
      return;
    }

    await this.voiceInput.stopRecording();
    this.clearResponseTimer();
  }

  async processUserInput(text: string): Promise<void> {
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

    } catch (error) {
      this.emit('error', error);
    } finally {
      this.state.isProcessing = false;
      this.emit('processing-stopped');
      
      // Continue listening if auto-listen is enabled
      if (this.config.autoListen && !this.state.isListening) {
        await this.startListening();
      }
    }
  }

  private async sendToAgent(text: string): Promise<string> {
    // This would integrate with the agent's chat endpoint
    // For now, we'll emit an event for the application to handle
    return new Promise((resolve, reject) => {
      this.emit('agent-request', text, (response: string) => {
        if (response) {
          resolve(response);
        } else {
          reject(new Error('No response from agent'));
        }
      });
      
      // Timeout if no response
      setTimeout(() => {
        reject(new Error('Agent response timeout'));
      }, this.config.responseTimeout!);
    });
  }

  async speak(text: string): Promise<void> {
    if (!text) return;

    this.state.isSpeaking = true;
    this.emit('speaking-started');

    try {
      await this.voiceEngine.playText(text);
    } catch (error) {
      this.emit('error', error);
    } finally {
      this.state.isSpeaking = false;
      this.emit('speaking-stopped');
    }
  }

  async stopSpeaking(): Promise<void> {
    if (!this.state.isSpeaking) {
      return;
    }

    this.voiceEngine.stopSpeaking();
    this.state.isSpeaking = false;
    this.emit('speaking-interrupted');
  }

  private resetResponseTimer(): void {
    this.clearResponseTimer();
    this.responseTimer = setTimeout(() => {
      this.stopListening();
      this.emit('response-timeout');
    }, this.config.responseTimeout!);
  }

  private clearResponseTimer(): void {
    if (this.responseTimer) {
      clearTimeout(this.responseTimer);
      this.responseTimer = null;
    }
  }

  private resetSilenceTimer(): void {
    this.clearSilenceTimer();
    this.silenceTimer = setTimeout(() => {
      this.processEndOfSpeech();
    }, this.config.maxSilenceDuration!);
  }

  private clearSilenceTimer(): void {
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }
  }

  private async processEndOfSpeech(): Promise<void> {
    await this.stopListening();
    
    if (this.state.currentTranscript) {
      await this.processUserInput(this.state.currentTranscript);
      this.state.currentTranscript = '';
    }
  }

  // Control methods
  async toggleListening(): Promise<void> {
    if (this.state.isListening) {
      await this.stopListening();
    } else {
      await this.startListening();
    }
  }

  async pushToTalk(pressed: boolean): Promise<void> {
    if (pressed) {
      await this.startListening();
    } else {
      await this.stopListening();
    }
  }

  // State getters
  getState(): ConversationState {
    return { ...this.state };
  }

  getConversationHistory(): Array<any> {
    return [...this.state.conversationHistory];
  }

  clearHistory(): void {
    this.state.conversationHistory = [];
  }

  // Cleanup
  async destroy(): Promise<void> {
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

// Export singleton instance
let conversationManagerInstance: ConversationManager | null = null;

export function initializeConversationManager(config?: ConversationConfig): ConversationManager {
  if (!conversationManagerInstance) {
    conversationManagerInstance = new ConversationManager(config);
  }
  return conversationManagerInstance;
}

export function getConversationManager(): ConversationManager | null {
  return conversationManagerInstance;
}
