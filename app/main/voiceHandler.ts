import { ipcMain, BrowserWindow } from 'electron';
import { EventEmitter } from 'events';
import path from 'path';
import { initializeConversationManager, getConversationManager } from '../../agent/voice/conversationManager';
import { initializeVoiceService } from '../../agent/services/voiceService';
// HybridSTT removed - using renderer-based STT instead
import axios from 'axios';

export class VoiceHandler extends EventEmitter {
  private mainWindow: BrowserWindow | null = null;
  private conversationManager: any = null;
  private isInitialized: boolean = false;
  private backendUrl: string;
  private isListening: boolean = false;
  private currentMode: 'auto' | 'push' | 'manual' = 'manual';
  private pushToTalkActive: boolean = false;
  // hybridSTT removed - using renderer-based STT

  // Public setter for backend URL
  public setBackendUrl(url: string): void {
    this.backendUrl = url;
  }

  constructor(window: BrowserWindow, backendUrl?: string) {
    super();
    this.mainWindow = window;
    // Prefer constructor-provided URL over default
    this.backendUrl = backendUrl || process.env.BACKEND_URL || 'http://localhost:3000';
    console.log('[VoiceHandler] Initialized with backend URL:', this.backendUrl);
    this.setupIPCHandlers();
    // STT handlers removed - using renderer-based STT
    
    // VoiceService must be initialized before conversationManager
    const ELEVEN_API_KEY = process.env.ELEVEN_API_KEY;
    if (!ELEVEN_API_KEY) {
      throw new Error('ElevenLabs API key not configured');
    }
    initializeVoiceService({ apiKey: ELEVEN_API_KEY });
    this.initializeConversationManager();
    // Hybrid STT initialization removed - using renderer-based STT
  }

  // Removed duplicate setBackendUrl - already defined above

  // Hybrid STT initialization removed - using renderer-based STT instead

  // STT handlers removed - now handled by renderer-based STT
  private setupSTTHandlers(): void {
    // All STT operations are now handled by the renderer process
    // via RendererHybridSTT exposed through preload.ts
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

    // STT status handler (was missing)
    ipcMain.handle('stt:get-status', async () => {
      return {
        currentEngine: 'RendererHybridSTT',
        isCloud: false,
        isLocal: true,
        isStarted: this.isListening,
        error: null
      };
    });

    // TTS Handlers - Using ElevenLabs API with browser fallback
    ipcMain.handle('voice:tts-speak', async (event, text: string, options?: any) => {
      try {
        // Try ElevenLabs first
        const audioData = await this.getElevenLabsAudio(text);
        
        // Send audio data to renderer to play using Web Audio API
        this.sendToRenderer('voice:tts-audio-data', audioData);
        this.sendToRenderer('voice:tts-started');
        
        return { success: true, provider: 'elevenlabs' };
      } catch (error: any) {
        console.warn('ElevenLabs TTS failed, falling back to browser TTS:', error);
        
        // Fallback to browser speechSynthesis
        try {
          this.sendToRenderer('voice:tts-browser-speak', { text, options });
          this.sendToRenderer('voice:tts-started');
          return { success: true, provider: 'browser' };
        } catch (fallbackError: any) {
          console.error('Both TTS providers failed:', fallbackError);
          this.sendToRenderer('voice:tts-error', 'All TTS providers failed');
          return { success: false, error: 'All TTS providers failed' };
        }
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
        sttStatus: null // STT status now managed by renderer
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
    const ELEVEN_API_KEY = process.env.ELEVEN_API_KEY;
    
    if (!ELEVEN_API_KEY) {
      throw new Error('ElevenLabs API key not configured');
    }

    try {
      const voiceId = 'rSZFtT0J8GtnLqoDoFAp'; // Nova Westbrook voice
      
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
          responseType: 'arraybuffer',
          timeout: 10000 // 10 second timeout
        }
      );

      return Buffer.from(response.data);
    } catch (error: any) {
      console.error('ElevenLabs API error:', error.message);
      
      // Provide more specific error messages
      if (error.code === 'ECONNREFUSED') {
        throw new Error('Cannot connect to ElevenLabs API');
      } else if (error.response?.status === 401) {
        throw new Error('Invalid ElevenLabs API key');
      } else if (error.response?.status === 429) {
        throw new Error('ElevenLabs API rate limit exceeded');
      }
      
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
      // STT start is now handled by renderer process
      console.log('[VoiceHandler] STT start requested - handled by renderer');
      this.isListening = true;
      this.sendToRenderer('voice:listening-started');
      console.log('[VoiceHandler] Voice listening started (renderer-based STT)');
    } catch (error: any) {
      console.error('[VoiceHandler] Failed to start listening:', error);
      this.isListening = false;
      throw error;
    }
  }
  
  private async stopListening(): Promise<void> {
    try {
      // STT stop is now handled by renderer process
      console.log('[VoiceHandler] STT stop requested - handled by renderer');
      this.isListening = false;
      this.sendToRenderer('voice:listening-stopped');
      console.log('[VoiceHandler] Voice listening stopped');
    } catch (error: any) {
      console.error('[VoiceHandler] Error stopping listening:', error);
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
    try {
      // Try ElevenLabs first
      const audioData = await this.getElevenLabsAudio(text);
      this.sendToRenderer('voice:tts-audio-data', audioData);
    } catch (error: any) {
      console.warn('ElevenLabs TTS failed in speak(), falling back to browser TTS:', error);
      // Fallback to browser speechSynthesis
      this.sendToRenderer('voice:tts-browser-speak', { text });
    }
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
      sttStatus: null // STT status now managed by renderer
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
      // STT cleanup now handled by renderer process
      console.log('[VoiceHandler] Cleanup - STT managed by renderer');
      
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
      
      // Remove handle-based IPC handlers
      ipcMain.removeHandler('voice:get-state');
      ipcMain.removeHandler('voice:get-history');
      ipcMain.removeHandler('voice:chat-with-tts');
      // Only remove the STT handler that is actually registered
      ipcMain.removeHandler('stt:get-status');
      
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
