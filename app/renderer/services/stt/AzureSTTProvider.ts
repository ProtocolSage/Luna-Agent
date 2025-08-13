/**
 * Azure Speech Service STT Provider
 * Cloud-based speech recognition with streaming support
 */

import { STTProvider, STTConfig, TranscriptionResult, STTEventMap } from './STTInterface';

export class AzureSTTProvider implements STTProvider {
  readonly name = 'Azure Speech';
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
  private reconnectDelay: number = 1000;
  
  private subscriptionKey: string = '';
  private region: string = '';
  private endpoint: string = '';

  constructor(subscriptionKey?: string, region?: string) {
    this.subscriptionKey = subscriptionKey || process.env.AZURE_SPEECH_KEY || '';
    this.region = region || process.env.AZURE_SPEECH_REGION || 'eastus';
    this.endpoint = `wss://${this.region}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1`;
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

    // Check if credentials are available
    if (!this.subscriptionKey) {
      throw new Error('Azure Speech subscription key not provided');
    }

    // Test connection health
    const healthCheck = await this.checkHealth();
    if (!healthCheck.healthy) {
      throw new Error(`Azure Speech service unavailable: ${healthCheck.error}`);
    }

    this._isInitialized = true;
    console.log('Azure STT provider initialized');
  }

  async startListening(): Promise<void> {
    if (!this._isInitialized) {
      throw new Error('Azure STT provider not initialized');
    }

    if (this._isListening) return;

    try {
      // Get microphone access
      this.audioStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });

      await this.connectWebSocket();
      this.setupMediaRecorder();
      
      this._isListening = true;
      this.emit('recording-started');
      console.log('Azure STT: Started listening');
      
    } catch (error: any) {
      this._isListening = false;
      console.error('Azure STT: Failed to start listening:', error);
      this.emit('error', `Failed to start Azure STT: ${error.message}`);
      throw error;
    }
  }

  async stopListening(): Promise<void> {
    if (!this._isListening) return;

    try {
      this._isListening = false;
      
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
      console.log('Azure STT: Stopped listening');
      
    } catch (error: any) {
      console.error('Azure STT: Error stopping:', error);
    }
  }

  private async connectWebSocket(): Promise<void> {
    return new Promise((resolve, reject) => {
      const connectionId = this.generateConnectionId();
      const url = `${this.endpoint}?${new URLSearchParams({
        'Ocp-Apim-Subscription-Key': this.subscriptionKey,
        'X-ConnectionId': connectionId,
        language: this.config.language || 'en-US',
        format: 'simple'
      })}`;

      this.websocket = new WebSocket(url);
      
      this.websocket.onopen = () => {
        console.log('Azure STT: WebSocket connected');
        this.reconnectAttempts = 0;
        resolve();
      };
      
      this.websocket.onmessage = (event) => {
        this.handleWebSocketMessage(event);
      };
      
      this.websocket.onerror = (error) => {
        console.error('Azure STT: WebSocket error:', error);
        this.emit('error', 'Azure Speech WebSocket connection error');
      };
      
      this.websocket.onclose = (event) => {
        console.log('Azure STT: WebSocket closed:', event.code, event.reason);
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

  private handleWebSocketMessage(event: MessageEvent): void {
    try {
      const data = JSON.parse(event.data);
      
      if (data.RecognitionStatus === 'Success') {
        const result: TranscriptionResult = {
          text: data.DisplayText || data.Text || '',
          confidence: data.Confidence || 1.0,
          isFinal: data.RecognitionStatus === 'Success',
          timestamp: Date.now()
        };
        
        if (result.text.trim()) {
          this.emit('transcription', result);
        }
      } else if (data.RecognitionStatus === 'Error') {
        this.emit('error', `Azure Speech recognition error: ${data.ErrorMessage || 'Unknown error'}`);
      }
      
    } catch (error) {
      console.error('Azure STT: Failed to parse WebSocket message:', error);
    }
  }

  private setupMediaRecorder(): void {
    if (!this.audioStream) return;

    this.mediaRecorder = new MediaRecorder(this.audioStream, {
      mimeType: 'audio/webm; codecs=opus'
    });

    this.mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0 && this.websocket && this.websocket.readyState === WebSocket.OPEN) {
        // Convert to the format expected by Azure Speech
        this.convertAndSendAudio(event.data);
      }
    };

    this.mediaRecorder.start(100); // Send data every 100ms
  }

  private async convertAndSendAudio(audioBlob: Blob): Promise<void> {
    try {
      const arrayBuffer = await audioBlob.arrayBuffer();
      
      // For Azure Speech, we need to send raw PCM data
      // This is a simplified conversion - in production, you might want to use a more robust audio conversion
      if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
        this.websocket.send(arrayBuffer);
      }
    } catch (error) {
      console.error('Azure STT: Failed to convert and send audio:', error);
    }
  }

  private attemptReconnect(): void {
    this.reconnectAttempts++;
    console.log(`Azure STT: Attempting reconnection ${this.reconnectAttempts}/${this.maxReconnectAttempts}`);
    
    setTimeout(async () => {
      if (this._isListening) {
        try {
          await this.connectWebSocket();
          this.setupMediaRecorder();
          this.emit('service-restored');
        } catch (error) {
          console.error('Azure STT: Reconnection failed:', error);
          if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            this.emit('service-unavailable', 'Azure Speech service unavailable after multiple reconnection attempts');
            this.stopListening();
          }
        }
      }
    }, this.reconnectDelay * this.reconnectAttempts);
  }

  private generateConnectionId(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  isListening(): boolean {
    return this._isListening;
  }

  isInitialized(): boolean {
    return this._isInitialized;
  }

  setLanguage(language: string): void {
    this.config.language = language;
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
      // Test connection to Azure Speech service
      const testUrl = `https://${this.region}.api.cognitive.microsoft.com/sts/v1.0/issuetoken`;
      const response = await fetch(testUrl, {
        method: 'POST',
        headers: {
          'Ocp-Apim-Subscription-Key': this.subscriptionKey,
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': '0'
        }
      });

      const latency = Date.now() - startTime;
      
      if (response.ok || response.status === 401) {
        // 401 is expected if key is invalid, but service is healthy
        return { healthy: true, latency };
      } else {
        return { healthy: false, error: `HTTP ${response.status}` };
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
          console.error(`Error in Azure STT event listener for ${event}:`, error);
        }
      });
    }
  }

  destroy(): void {
    this.stopListening();
    this.eventListeners.clear();
    console.log('Azure STT provider destroyed');
  }
}
