/**
 * Renderer-Based Hybrid STT Service
 * Runs in renderer process where browser APIs (getUserMedia, WebSocket) are available
 */

import { STTProvider, STTConfig, TranscriptionResult } from './STTInterface';

export class RendererCloudSTT implements STTProvider {
  readonly name = 'Renderer Cloud STT';
  readonly isOnlineService = true;
  
  private config: STTConfig = {};
  private _isInitialized: boolean = false;
  private _isListening: boolean = false;
  private eventListeners: Map<string, Array<(...args: any[]) => void>> = new Map();
  private websocket: WebSocket | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private audioStream: MediaStream | null = null;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 3;
  private abortController: AbortController | null = null;
  
  private cloudConfig = {
    service: 'azure', // Default to Azure
    azureKey: '',
    azureRegion: 'eastus',
    deepgramKey: '',
    googleKey: '',
    language: 'en-US'
  };

  constructor() {
    // Initialize cloud config from environment exposed via preload
    const env = (window as any).__ENV || {};
    this.cloudConfig = {
      service: (env.STT_PROVIDER as 'azure' | 'deepgram' | 'google') || 'azure',
      azureKey: env.AZURE_SPEECH_KEY,
      azureRegion: env.AZURE_SPEECH_REGION || 'eastus',
      deepgramKey: env.DEEPGRAM_API_KEY,
      googleKey: env.GOOGLE_CLOUD_API_KEY,
      language: 'en-US'
    };
  }

  async initialize(config: STTConfig): Promise<void> {
    if (this._isInitialized) return;
    
    this.config = {
      language: 'en-US',
      continuous: true,
      interimResults: true,
      maxAlternatives: 1,
      silenceDuration: 1500,
      ...config
    };

    // Check if we're in browser context
    if (typeof navigator === 'undefined' || !navigator.mediaDevices) {
      throw new Error('Cloud STT requires browser context with navigator.mediaDevices');
    }

    // Check if credentials are available - if not, fail immediately for fallback
    if (!this.cloudConfig.azureKey && !this.cloudConfig.deepgramKey) {
      console.warn('[RendererCloudSTT] No cloud STT credentials configured. Will fallback to Whisper.');
      throw new Error('NO_CLOUD_CREDENTIALS: No Azure or Deepgram API keys configured');
    }

    this._isInitialized = true;
    console.log('[RendererCloudSTT] Initialized successfully');
  }

  async startListening(): Promise<void> {
    if (!this._isInitialized) {
      throw new Error('Cloud STT not initialized');
    }

    if (this._isListening) return;

    try {
      this.abortController = new AbortController();
      
      // Get microphone access in renderer process (where it works)
      this.audioStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });

      await this.connectToCloudService();
      this.setupAudioStreaming();
      
      this._isListening = true;
      this.emit('recording-started');
      console.log('[RendererCloudSTT] Started listening');
      
    } catch (error: any) {
      this._isListening = false;
      console.error('[RendererCloudSTT] Failed to start:', error);
      this.emit('error', `Failed to start cloud STT: ${error.message}`);
      throw error;
    }
  }

  async stopListening(): Promise<void> {
    if (!this._isListening) return;

    try {
      this._isListening = false;
      this.abortController?.abort();
      
      // Stop media recorder
      if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
        this.mediaRecorder.stop();
      }
      
      // Stop audio stream
      if (this.audioStream) {
        this.audioStream.getTracks().forEach(track => track.stop());
        this.audioStream = null;
      }
      
      // Close WebSocket
      if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
        this.websocket.close();
      }
      
      this.emit('recording-stopped');
      console.log('[RendererCloudSTT] Stopped listening');
      
    } catch (error: any) {
      console.error('[RendererCloudSTT] Error stopping:', error);
    }
  }

  private async connectToCloudService(): Promise<void> {
    if (this.cloudConfig.service === 'azure' && this.cloudConfig.azureKey) {
      await this.connectAzure();
    } else if (this.cloudConfig.service === 'deepgram' && this.cloudConfig.deepgramKey) {
      await this.connectDeepgram();
    } else {
      throw new Error(`No valid cloud STT service configured. Service: ${this.cloudConfig.service}, Keys available: Azure=${!!this.cloudConfig.azureKey}, Deepgram=${!!this.cloudConfig.deepgramKey}`);
    }
  }

  private async connectAzure(): Promise<void> {
    return new Promise((resolve, reject) => {
      const connectionId = this.generateConnectionId();
      const wsUrl = `wss://${this.cloudConfig.azureRegion}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1?${new URLSearchParams({
        'Ocp-Apim-Subscription-Key': this.cloudConfig.azureKey,
        'X-ConnectionId': connectionId,
        language: this.config.language || 'en-US',
        format: 'simple'
      })}`;

      this.websocket = new WebSocket(wsUrl);
      
      this.websocket.onopen = () => {
        console.log('[RendererCloudSTT] Azure WebSocket connected');
        this.reconnectAttempts = 0;
        resolve();
      };
      
      this.websocket.onmessage = (event) => {
        this.handleAzureMessage(event);
      };
      
      this.websocket.onerror = (error) => {
        console.error('[RendererCloudSTT] Azure WebSocket error:', error);
        reject(new Error('Azure Speech WebSocket connection error'));
      };
      
      this.websocket.onclose = (event) => {
        console.log('[RendererCloudSTT] Azure WebSocket closed:', event.code, event.reason);
        if (this._isListening && this.reconnectAttempts < this.maxReconnectAttempts) {
          this.attemptReconnect();
        }
      };
      
      // Connection timeout
      setTimeout(() => {
        if (this.websocket && this.websocket.readyState === WebSocket.CONNECTING) {
          this.websocket.close();
          reject(new Error('Azure Speech WebSocket connection timeout'));
        }
      }, 10000);
    });
  }

  private async connectDeepgram(): Promise<void> {
    return new Promise((resolve, reject) => {
      const wsUrl = `wss://api.deepgram.com/v1/listen?${new URLSearchParams({
        encoding: 'webm',
        sample_rate: '16000',
        channels: '1',
        interim_results: 'true',
        punctuate: 'true',
        smart_format: 'true'
      })}`;

      this.websocket = new WebSocket(wsUrl, ['token', this.cloudConfig.deepgramKey]);
      
      this.websocket.onopen = () => {
        console.log('[RendererCloudSTT] Deepgram WebSocket connected');
        this.reconnectAttempts = 0;
        resolve();
      };
      
      this.websocket.onmessage = (event) => {
        this.handleDeepgramMessage(event);
      };
      
      this.websocket.onerror = (error) => {
        console.error('[RendererCloudSTT] Deepgram WebSocket error:', error);
        reject(new Error('Deepgram WebSocket connection error'));
      };
      
      this.websocket.onclose = (event) => {
        console.log('[RendererCloudSTT] Deepgram WebSocket closed:', event.code, event.reason);
        if (this._isListening && this.reconnectAttempts < this.maxReconnectAttempts) {
          this.attemptReconnect();
        }
      };
      
      // Connection timeout
      setTimeout(() => {
        if (this.websocket && this.websocket.readyState === WebSocket.CONNECTING) {
          this.websocket.close();
          reject(new Error('Deepgram WebSocket connection timeout'));
        }
      }, 10000);
    });
  }

  private setupAudioStreaming(): void {
    if (!this.audioStream) return;

    this.mediaRecorder = new MediaRecorder(this.audioStream, {
      mimeType: 'audio/webm; codecs=opus'
    });

    this.mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0 && this.websocket && this.websocket.readyState === WebSocket.OPEN) {
        // Send audio data to cloud STT service
        this.websocket.send(event.data);
      }
    };

    this.mediaRecorder.start(100); // Send data every 100ms
  }

  private handleAzureMessage(event: MessageEvent): void {
    try {
      const data = JSON.parse(event.data);
      
      if (data.RecognitionStatus === 'Success') {
        const result: TranscriptionResult = {
          text: data.DisplayText || data.Text || '',
          confidence: data.Confidence || 1.0,
          isFinal: true, // Azure provides final results
          timestamp: Date.now()
        };
        
        if (result.text.trim()) {
          this.emit('transcription', result);
        }
      } else if (data.RecognitionStatus === 'Error') {
        this.emit('error', `Azure Speech error: ${data.ErrorMessage || 'Unknown error'}`);
      }
      
    } catch (error) {
      console.error('[RendererCloudSTT] Failed to parse Azure message:', error);
    }
  }

  private handleDeepgramMessage(event: MessageEvent): void {
    try {
      const data = JSON.parse(event.data);
      
      if (data.channel && data.channel.alternatives && data.channel.alternatives.length > 0) {
        const alternative = data.channel.alternatives[0];
        if (alternative.transcript && alternative.transcript.trim()) {
          const result: TranscriptionResult = {
            text: alternative.transcript,
            confidence: alternative.confidence || 1.0,
            isFinal: data.is_final || false,
            timestamp: Date.now()
          };
          
          this.emit('transcription', result);
        }
      }
      
    } catch (error) {
      console.error('[RendererCloudSTT] Failed to parse Deepgram message:', error);
    }
  }

  private attemptReconnect(): void {
    this.reconnectAttempts++;
    console.log(`[RendererCloudSTT] Attempting reconnection ${this.reconnectAttempts}/${this.maxReconnectAttempts}`);
    
    setTimeout(async () => {
      if (this._isListening && !this.abortController?.signal.aborted) {
        try {
          await this.connectToCloudService();
          this.setupAudioStreaming();
        } catch (error) {
          console.error('[RendererCloudSTT] Reconnection failed:', error);
          if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            this.emit('error', 'Cloud STT service unavailable after multiple reconnection attempts');
            this.stopListening();
          }
        }
      }
    }, 1000 * this.reconnectAttempts);
  }

  private generateConnectionId(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  // Interface implementations
  isListening(): boolean {
    return this._isListening;
  }

  isInitialized(): boolean {
    return this._isInitialized;
  }

  setLanguage(language: string): void {
    this.config.language = language;
    this.cloudConfig.language = language;
  }

  getCapabilities() {
    return {
      streamingSupport: true,
      offlineSupport: false,
      languageDetection: false,
      punctuation: true,
      profanityFilter: true
    };
  }

  async checkHealth(): Promise<{ healthy: boolean; latency?: number; error?: string }> {
    const startTime = Date.now();
    
    try {
      if (this.cloudConfig.service === 'azure' && this.cloudConfig.azureKey) {
        const testUrl = `https://${this.cloudConfig.azureRegion}.api.cognitive.microsoft.com/sts/v1.0/issuetoken`;
        const response = await fetch(testUrl, {
          method: 'POST',
          headers: {
            'Ocp-Apim-Subscription-Key': this.cloudConfig.azureKey,
            'Content-Type': 'application/x-www-form-urlencoded',
            'Content-Length': '0'
          }
        });

        const latency = Date.now() - startTime;
        return { healthy: response.ok || response.status === 401, latency };
        
      } else if (this.cloudConfig.service === 'deepgram' && this.cloudConfig.deepgramKey) {
        // Simple Deepgram health check
        const testUrl = 'https://api.deepgram.com/v1/projects';
        const response = await fetch(testUrl, {
          headers: {
            'Authorization': `Token ${this.cloudConfig.deepgramKey}`
          }
        });

        const latency = Date.now() - startTime;
        return { healthy: response.ok || response.status === 401, latency };
      } else {
        return { healthy: false, error: 'No cloud STT credentials configured' };
      }
      
    } catch (error: any) {
      return { 
        healthy: false, 
        error: error.message || 'Network error' 
      };
    }
  }

  // Event emitter methods
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
          console.error(`[RendererCloudSTT] Error in event listener for ${event}:`, error);
        }
      });
    }
  }

  destroy(): void {
    this.stopListening();
    this.eventListeners.clear();
    console.log('[RendererCloudSTT] Destroyed');
  }
}
