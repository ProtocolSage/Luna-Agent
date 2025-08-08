import { ipcMain, BrowserWindow } from 'electron';
import { EventEmitter } from 'events';
import path from 'path';
import { initializeConversationManager, getConversationManager } from '../../agent/voice/conversationManager';
import { initializeVoiceService } from '../../agent/services/voiceService';
import { HybridSTT } from '../../agent/voice/stt/HybridSTT';
import axios from 'axios';

export class VoiceHandler extends EventEmitter {
  private mainWindow: BrowserWindow | null = null;
  private conversationManager: any = null;
  private isInitialized: boolean = false;
  private backendUrl: string;
  private isListening: boolean = false;
  private currentMode: 'auto' | 'push' | 'manual' = 'manual';
  private pushToTalkActive: boolean = false;
  private hybridSTT: HybridSTT | null = null;

  constructor(window: BrowserWindow) {
    super();
    this.mainWindow = window;
    // Use configured backend URL or default to the agent server port (3000)
    this.backendUrl = process.env.BACKEND_URL || `http://localhost:${process.env.PORT || '3000'}`;
    this.setupIPCHandlers();
    this.setupSTTHandlers();
    
    // VoiceService must be initialized before conversationManager
    const ELEVEN_API_KEY = process.env.ELEVEN_API_KEY;
    if (!ELEVEN_API_KEY) {
      throw new Error('ElevenLabs API key not configured');
    }
    initializeVoiceService({ apiKey: ELEVEN_API_KEY });
    this.initializeConversationManager();
    
    // Initialize Hybrid STT
    this.initializeHybridSTT();
  }

  private async initializeHybridSTT(): void {
    try {
      // Cloud-first by default (can be changed via config)
      const preferLocal = process.env.STT_PREFER_LOCAL === 'true';
      this.hybridSTT = new HybridSTT(preferLocal);
      
      // Forward STT events to renderer
      this.hybridSTT.on('transcript', (transcript) => {
        this.sendToRenderer('stt:transcript', transcript);
      });

      this.hybridSTT.on('engine-switched', (info) => {
        console.log(`[VoiceHandler] STT engine switched to: ${info.engine}`);
        this.sendToRenderer('stt:engine-switched', info);
      });

      console.log('[VoiceHandler] Hybrid STT initialized successfully');
    } catch (error) {
      console.error('[VoiceHandler] Failed to initialize Hybrid STT:', error);
    }
  }

  private setupSTTHandlers(): void {
    // STT control handlers
    ipcMain.handle('stt:start', async () => {
      try {
        if (!this.hybridSTT) {
          throw new Error('Hybrid STT not initialized');
        }
        await this.hybridSTT.start();
        this.isListening = true;
        return { success: true };
      } catch (error: any) {
        console.error('[VoiceHandler] STT start error:', error);
        return { success: false, error: error.message };
      }
    });

    ipcMain.handle('stt:stop', async () => {
      try {
        if (!this.hybridSTT) {
          throw new Error('Hybrid STT not initialized');
        }
        await this.hybridSTT.stop();
        this.isListening = false;
        return { success: true };
      } catch (error: any) {
        console.error('[VoiceHandler] STT stop error:', error);
        return { success: false, error: error.message };
      }
    });

    // STT status and control
    ipcMain.handle('stt:get-status', async () => {
      if (!this.hybridSTT) {
        return { error: 'STT not initialized' };
      }
      return this.hybridSTT.getStatus();
    });

    ipcMain.handle('stt:switch-to-cloud', async () => {
      try {
        if (!this.hybridSTT) {
          throw new Error('Hybrid STT not initialized');
        }
        await this.hybridSTT.switchToCloud();
        return { success: true, engine: 'CloudSTT' };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    });

    ipcMain.handle('stt:switch-to-whisper', async () => {
      try {
        if (!this.hybridSTT) {
          throw new Error('Hybrid STT not initialized');
        }
        await this.hybridSTT.switchToWhisper();
        return { success: true, engine: 'WhisperSTT' };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    });

    ipcMain.handle('stt:health-check', async () => {
      if (!this.hybridSTT) {
        return { error: 'STT not initialized' };
      }
      return await this.hybridSTT.checkHealth();
    });
  }

  private setupIPCHandlers(): void {
    // Initialize voice system
    ipcMain.on('voice:initialize', async (event) => {
      try {
        await this.initialize();
        event.reply('voice:initialized');
      } catch (error: any) {
        console.error('Voice initialization error:', error);
        event.reply('voice:error', error.message);
      }
    });

    // TTS Handlers - Using ElevenLabs API directly
    ipcMain.handle('voice:tts-speak', async (event, text: string, options?: any) => {
      try {
        // Instead of using native speaker, we'll stream audio to renderer
        const audioData = await this.getElevenLabsAudio(text);
        
        // Send audio data to renderer to play using Web Audio API
        this.sendToRenderer('voice:tts-audio-data', audioData);
        this.sendToRenderer('voice:tts-started');
        
        return { success: true };
      } catch (error: any) {
        console.error('TTS error:', error);
        this.sendToRenderer('voice:tts-error', error.message);
        return { success: false, error: error.message };
      }
    });

    ipcMain.on('voice:tts-stop', async (event) => {
      try {
        // Signal renderer to stop audio playback
        this.sendToRenderer('voice:tts-stop-playback');
        event.reply('voice:tts-stopped');
      } catch (error: any) {
        event.reply('voice:tts-error', error.message);
      }
    });

    ipcMain.on('voice:tts-switch-voice', (event, voiceName: string) => {
      try {
        // Store voice preference (can be used when calling ElevenLabs)
        event.reply('voice:tts-voice-changed', voiceName);
      } catch (error: any) {
        event.reply('voice:tts-error', error.message);
      }
    });

    // Start listening - NOW USES HYBRID STT
    ipcMain.on('voice:start-listening', async (event) => {
      try {
        await this.startListening();
        event.reply('voice:listening-started');
      } catch (error: any) {
        console.error('Start listening error:', error);
        event.reply('voice:error', error.message);
      }
    });

    // Stop listening - NOW USES HYBRID STT
    ipcMain.on('voice:stop-listening', async (event) => {
      try {
        await this.stopListening();
        event.reply('voice:listening-stopped');
      } catch (error: any) {
        console.error('Stop listening error:', error);
        event.reply('voice:error', error.message);
      }
    });

    // Push-to-talk - REAL implementation
    ipcMain.on('voice:push-to-talk', async (event, pressed: boolean) => {
      try {
        await this.handlePushToTalk(pressed);
        event.reply('voice:push-to-talk-' + (pressed ? 'pressed' : 'released'));
      } catch (error: any) {
        console.error('Push-to-talk error:', error);
        event.reply('voice:error', error.message);
      }
    });

    ipcMain.on('voice:set-mode', (event, mode: 'auto' | 'push' | 'manual') => {
      try {
        this.currentMode = mode;
        console.log(`Voice mode changed to: ${mode}`);
        
        // Stop current listening if changing modes
        if (this.isListening) {
          this.stopListening();
        }
        
        // Auto-start listening in auto mode
        if (mode === 'auto' && this.conversationManager) {
          this.conversationManager.config.autoListen = true;
          this.startListening();
        }
        
        event.reply('voice:mode-changed', mode);
      } catch (error: any) {
        console.error('Set mode error:', error);
        event.reply('voice:error', error.message);
      }
    });

    ipcMain.handle('voice:get-state', async () => {
      return {
        isListening: this.isListening,
        isInitialized: this.isInitialized,
        currentMode: this.currentMode,
        pushToTalkActive: this.pushToTalkActive,
        conversationState: this.conversationManager?.getState() || null,
        sttStatus: this.hybridSTT?.getStatus() || null
      };
    });

    ipcMain.handle('voice:get-history', async () => {
      if (this.conversationManager) {
        return this.conversationManager.getConversationHistory();
      }
      return [];
    });

    ipcMain.on('voice:clear-history', (event) => {
      try {
        if (this.conversationManager) {
          this.conversationManager.clearHistory();
        }
        event.reply('voice:history-cleared');
      } catch (error: any) {
        console.error('Clear history error:', error);
        event.reply('voice:error', error.message);
      }
    });

    ipcMain.on('voice:command', async (event, command: string) => {
      try {
        await this.processVoiceCommand(command);
        event.reply('voice:command-processed', command);
      } catch (error: any) {
        console.error('Voice command error:', error);
        event.reply('voice:error', error.message);
      }
    });

    // Handle chat messages
    ipcMain.handle('voice:chat-with-tts', async (event, message: string) => {
      try {
        const response = await this.sendToAgent(message);
        return { success: true, response };
      } catch (error: any) {
        console.error('Chat error:', error);
        return { success: false, error: error.message };
      }
    });

    // Handle VAD (Voice Activity Detection) events from renderer
    ipcMain.on('vad', (event, data) => {
      if (data.status === 'stt-failed') {
        console.log('[VoiceHandler] Renderer STT failed, hybrid STT will handle this');
        // The hybrid STT system will automatically handle failover
      }
    });
  }

  private async getElevenLabsAudio(text: string): Promise<Buffer> {
    try {
      const ELEVEN_API_KEY = process.env.ELEVEN_API_KEY;
      const voiceId = 'rSZFtT0J8GtnLqoDoFAp'; // Nova Westbrook voice
      
      if (!ELEVEN_API_KEY) {
        throw new Error('ElevenLabs API key not configured');
      }

      const response = await axios.post(
        `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream`,
        {
          text,
          model_id: 'eleven_monolingual_v1',
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
            style: 0.0,
            use_speaker_boost: true
          }
        },
        {
          headers: {
            'xi-api-key': ELEVEN_API_KEY,
            'Content-Type': 'application/json',
            'Accept': 'audio/mpeg'
          },
          responseType: 'arraybuffer'
        }
      );

      return Buffer.from(response.data);
    } catch (error: any) {
      console.error('ElevenLabs API error:', error.message);
      throw error;
    }
  }

  private async sendToAgent(text: string): Promise<string> {
    try {
      const response = await axios.post(`${this.backendUrl}/api/agent/chat`, {
        message: text,
        sessionId: this.getSessionId(),
        mode: 'voice',
        useTools: true
      }, {
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 30000
      });

      // Handle different response types from agent
      if (response.data) {
        if (response.data.type === 'tool_results' && response.data.results) {
          // Handle tool execution results
          const toolResults = response.data.results;
          if (Array.isArray(toolResults) && toolResults.length > 0) {
            return toolResults.map(r => r.result || r.toString()).join('\n');
          }
        } else if (response.data.response) {
          // Handle direct response
          return response.data.response;
        } else if (response.data.content) {
          // Handle content-based response
          return response.data.content;
        } else if (typeof response.data === 'string') {
          // Handle plain string response
          return response.data;
        }
      }
      
      throw new Error('Invalid response from agent');
    } catch (error: any) {
      console.error('Failed to send to agent:', error);
      
      if (error.code === 'ECONNREFUSED') {
        return "I'm sorry, I cannot connect to the backend service right now.";
      }
      
      throw error;
    }
  }

  private getSessionId(): string {
    return `voice-session-${Date.now()}`;
  }

  private sendToRenderer(channel: string, ...args: any[]): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, ...args);
    }
  }

  private async initialize(): Promise<void> {
    try {
      console.log('Initializing voice handler...');
      
      // Initialize conversation manager if not already done
      if (!this.conversationManager) {
        await this.initializeConversationManager();
      }
      
      this.isInitialized = true;
      console.log('Voice handler initialized successfully');
      this.emit('initialized');
    } catch (error: any) {
      console.error('Voice handler initialization failed:', error);
      throw error;
    }
  }

  private async initializeConversationManager(): Promise<void> {
    try {
      if (this.conversationManager) {
        return; // Already initialized
      }
      
      console.log('Conversation manager initialization skipped - voice input handled by hybrid STT');
      
      // Set up a simple state manager instead of full conversation manager
      this.conversationManager = {
        getState: () => ({
          isListening: this.isListening,
          isSpeaking: false,
          isProcessing: false,
          currentTranscript: '',
          conversationHistory: [],
          lastInteractionTime: Date.now()
        }),
        getConversationHistory: () => [],
        clearHistory: () => {},
        destroy: () => {}
      };
      
      console.log('Simple conversation state manager initialized');
    } catch (error: any) {
      console.error('Failed to initialize conversation state manager:', error);
      throw error;
    }
  }

  private async startListening(): Promise<void> {
    try {
      if (!this.hybridSTT) {
        throw new Error('Hybrid STT not initialized');
      }
      
      await this.hybridSTT.start();
      this.isListening = true;
      this.sendToRenderer('voice:listening-started');
      console.log('[VoiceHandler] Voice listening started with Hybrid STT');
    } catch (error: any) {
      console.error('[VoiceHandler] Failed to start listening:', error);
      this.isListening = false;
      throw error;
    }
  }
  
  private async stopListening(): Promise<void> {
    try {
      if (!this.hybridSTT) {
        console.warn('[VoiceHandler] Hybrid STT not initialized');
        return;
      }
      
      await this.hybridSTT.stop();
      this.isListening = false;
      this.sendToRenderer('voice:listening-stopped');
      console.log('[VoiceHandler] Voice listening stopped');
    } catch (error: any) {
      console.error('[VoiceHandler] Error stopping listening:', error);
      this.isListening = false;
    }
  }
  
  private async handlePushToTalk(pressed: boolean): Promise<void> {
    if (this.currentMode !== 'push') {
      return; // Only handle push-to-talk in push mode
    }
    
    if (pressed && !this.pushToTalkActive) {
      this.pushToTalkActive = true;
      console.log('Push-to-talk activated');
      await this.startListening();
    } else if (!pressed && this.pushToTalkActive) {
      this.pushToTalkActive = false;
      console.log('Push-to-talk released');
      await this.stopListening();
    }
  }
  
  private async processVoiceCommand(command: string): Promise<void> {
    try {
      // Process voice command by sending to agent and speaking response
      const response = await this.sendToAgent(command);
      
      // Generate TTS for the response
      const audioData = await this.getElevenLabsAudio(response);
      this.sendToRenderer('voice:tts-audio-data', audioData);
      
      console.log('Voice command processed successfully');
    } catch (error: any) {
      console.error('Failed to process voice command:', error);
      throw error;
    }
  }

  // Public methods
  async speak(text: string): Promise<void> {
    // Delegate to renderer process
    const audioData = await this.getElevenLabsAudio(text);
    this.sendToRenderer('voice:tts-audio-data', audioData);
  }

  async interrupt(): Promise<void> {
    this.sendToRenderer('voice:tts-stop-playback');
  }

  getState(): any {
    return {
      isListening: this.isListening,
      isInitialized: this.isInitialized,
      currentMode: this.currentMode,
      pushToTalkActive: this.pushToTalkActive,
      conversationState: this.conversationManager?.getState() || null,
      sttStatus: this.hybridSTT?.getStatus() || null
    };
  }

  isReady(): boolean {
    return this.isInitialized;
  }

  // Cleanup
  async destroy(): Promise<void> {
    try {
      // Stop any active listening
      if (this.isListening) {
        await this.stopListening();
      }
      
      // Clean up hybrid STT
      if (this.hybridSTT) {
        await this.hybridSTT.stop();
        this.hybridSTT = null;
      }
      
      // Clean up conversation manager
      if (this.conversationManager) {
        this.conversationManager.destroy();
        this.conversationManager = null;
      }
      
      // Remove all IPC handlers
      ipcMain.removeAllListeners('voice:initialize');
      ipcMain.removeAllListeners('voice:start-listening');
      ipcMain.removeAllListeners('voice:stop-listening');
      ipcMain.removeAllListeners('voice:push-to-talk');
      ipcMain.removeAllListeners('voice:set-mode');
      ipcMain.removeAllListeners('voice:command');
      ipcMain.removeAllListeners('voice:clear-history');
      ipcMain.removeAllListeners('voice:tts-speak');
      ipcMain.removeAllListeners('voice:tts-stop');
      ipcMain.removeAllListeners('voice:tts-switch-voice');
      ipcMain.removeAllListeners('vad');
      
      ipcMain.removeHandler('voice:get-state');
      ipcMain.removeHandler('voice:get-history');
      ipcMain.removeHandler('voice:chat-with-tts');
      ipcMain.removeHandler('stt:start');
      ipcMain.removeHandler('stt:stop');
      ipcMain.removeHandler('stt:get-status');
      ipcMain.removeHandler('stt:switch-to-cloud');
      ipcMain.removeHandler('stt:switch-to-whisper');
      ipcMain.removeHandler('stt:health-check');
      
      this.isInitialized = false;
      this.isListening = false;
      this.pushToTalkActive = false;
      this.removeAllListeners();
      
      console.log('Voice handler destroyed successfully');
    } catch (error: any) {
      console.error('Error during voice handler cleanup:', error);
    }
  }
}

export default VoiceHandler;
