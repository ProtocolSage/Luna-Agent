import { EventEmitter } from 'events';

/**
 * WebSocket STT Client
 * Client-side service for streaming Speech-to-Text via WebSocket
 * 
 * Features:
 * - Real-time audio streaming to backend
 * - Receives partial and final transcriptions
 * - Automatic reconnection on disconnect
 * - Buffer management
 * - Multiple audio format support
 */

interface STTConfig {
  model?: string;
  language?: string;
  temperature?: number;
  minChunkDuration?: number;
  maxChunkDuration?: number;
  sampleRate?: number;
  enablePartialResults?: boolean;
}

interface TranscriptionResult {
  text: string;
  isFinal: boolean;
  duration?: number;
  language?: string;
  timestamp: number;
}

export class WebSocketSTTClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private sessionId: string | null = null;
  private isConnected: boolean = false;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 5;
  private reconnectInterval: number = 3000;
  
  // Audio recording
  private mediaStream: MediaStream | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private isRecording: boolean = false;
  private audioChunks: Blob[] = [];
  
  // Configuration
  private config: STTConfig = {
    model: 'whisper-1',
    language: 'en',
    temperature: 0,
    enablePartialResults: true
  };
  
  constructor() {
    super();
    console.log('[WebSocketSTTClient] Client created');
  }
  
  /**
   * Connect to WebSocket STT server
   */
  public async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws/voice/stt`;
      
      console.log(`[WebSocketSTTClient] Connecting to ${wsUrl}`);
      
      this.ws = new WebSocket(wsUrl);
      
      this.ws.onopen = () => {
        console.log('[WebSocketSTTClient] Connected to server');
        this.isConnected = true;
        this.reconnectAttempts = 0;
        this.emit('connected');
      };
      
      this.ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          this.handleMessage(message);
          
          // Resolve on session-ready
          if (message.type === 'session-ready') {
            this.sessionId = message.sessionId;
            resolve();
          }
        } catch (error) {
          console.error('[WebSocketSTTClient] Message parsing error:', error);
        }
      };
      
      this.ws.onerror = (error) => {
        console.error('[WebSocketSTTClient] WebSocket error:', error);
        this.emit('error', 'WebSocket connection error');
        reject(error);
      };
      
      this.ws.onclose = () => {
        console.log('[WebSocketSTTClient] Disconnected from server');
        this.isConnected = false;
        this.emit('disconnected');
        
        // Attempt to reconnect
        this.attemptReconnect();
      };
      
      // Connection timeout
      setTimeout(() => {
        if (!this.isConnected) {
          reject(new Error('Connection timeout'));
        }
      }, 10000);
    });
  }
  
  /**
   * Disconnect from server
   */
  public disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.isConnected = false;
    this.sessionId = null;
    
    // Stop recording if active
    this.stopRecording();
  }
  
  /**
   * Start recording audio
   */
  public async startRecording(): Promise<void> {
    if (this.isRecording) {
      console.warn('[WebSocketSTTClient] Already recording');
      return;
    }
    
    try {
      // Request microphone access
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
      
      // Create MediaRecorder
      const mimeType = this.getSupportedMimeType();
      this.mediaRecorder = new MediaRecorder(this.mediaStream, {
        mimeType,
        audioBitsPerSecond: 128000
      });
      
      this.audioChunks = [];
      
      // Handle audio data
      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.audioChunks.push(event.data);
          
          // Send audio chunk to server
          if (this.isConnected && this.ws) {
            this.ws.send(event.data);
          }
        }
      };
      
      this.mediaRecorder.onstop = async () => {
        console.log('[WebSocketSTTClient] Recording stopped');
        
        // Send flush command to process remaining audio
        if (this.isConnected) {
          this.sendControlMessage({ type: 'flush' });
        }
        
        this.emit('recording-stopped');
      };
      
      // Start recording with 1-second timeslices
      this.mediaRecorder.start(1000);
      this.isRecording = true;
      
      console.log('[WebSocketSTTClient] Recording started');
      this.emit('recording-started');
      
    } catch (error) {
      console.error('[WebSocketSTTClient] Failed to start recording:', error);
      this.emit('error', 'Failed to start recording');
      throw error;
    }
  }
  
  /**
   * Stop recording audio
   */
  public stopRecording(): void {
    if (!this.isRecording) {
      return;
    }
    
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }
    
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
      this.mediaStream = null;
    }
    
    this.isRecording = false;
    this.mediaRecorder = null;
  }
  
  /**
   * Send audio data directly (alternative to recording)
   */
  public sendAudioData(audioData: ArrayBuffer | Blob): void {
    if (!this.isConnected || !this.ws) {
      console.warn('[WebSocketSTTClient] Not connected to server');
      return;
    }
    
    if (audioData instanceof ArrayBuffer) {
      this.ws.send(audioData);
    } else {
      this.ws.send(audioData);
    }
  }
  
  /**
   * Update configuration
   */
  public async updateConfig(updates: Partial<STTConfig>): Promise<void> {
    this.config = { ...this.config, ...updates };
    
    if (this.isConnected) {
      this.sendControlMessage({
        type: 'configure',
        config: updates
      });
    }
  }
  
  /**
   * Get current configuration
   */
  public getConfig(): STTConfig {
    return { ...this.config };
  }
  
  /**
   * Get session status
   */
  public async getStatus(): Promise<any> {
    return new Promise((resolve) => {
      if (!this.isConnected) {
        resolve({
          connected: false,
          sessionId: null
        });
        return;
      }
      
      // Listen for status update
      const handler = (message: any) => {
        if (message.type === 'status-update') {
          this.off('message', handler);
          resolve(message.status);
        }
      };
      
      this.on('message', handler);
      
      // Request status
      this.sendControlMessage({ type: 'get-status' });
      
      // Timeout
      setTimeout(() => {
        this.off('message', handler);
        resolve({
          connected: this.isConnected,
          sessionId: this.sessionId,
          timeout: true
        });
      }, 5000);
    });
  }
  
  /**
   * Reset the STT service
   */
  public reset(): void {
    if (this.isConnected) {
      this.sendControlMessage({ type: 'reset' });
    }
  }
  
  /**
   * Flush remaining audio buffer
   */
  public flush(): void {
    if (this.isConnected) {
      this.sendControlMessage({ type: 'flush' });
    }
  }
  
  // Private methods
  
  private handleMessage(message: any): void {
    const { type } = message;
    
    switch (type) {
      case 'session-ready':
        console.log('[WebSocketSTTClient] Session ready:', message.sessionId);
        this.emit('ready', {
          sessionId: message.sessionId,
          capabilities: message.capabilities,
          config: message.config
        });
        break;
        
      case 'transcription':
        console.log('[WebSocketSTTClient] Transcription:', message.text);
        this.emit('transcription', {
          text: message.text,
          isFinal: message.isFinal,
          duration: message.duration,
          language: message.language,
          timestamp: message.timestamp
        } as TranscriptionResult);
        break;
        
      case 'processing':
        this.emit('processing', {
          chunks: message.chunks,
          size: message.size,
          duration: message.duration
        });
        break;
        
      case 'config-updated':
        this.emit('config-updated', message.config);
        break;
        
      case 'status-update':
        this.emit('status-update', message.status);
        break;
        
      case 'error':
        console.error('[WebSocketSTTClient] Server error:', message.error);
        this.emit('error', {
          message: message.error,
          code: message.code
        });
        break;
        
      default:
        console.log('[WebSocketSTTClient] Unknown message type:', type);
        this.emit('message', message);
    }
  }
  
  private sendControlMessage(message: any): void {
    if (this.isConnected && this.ws) {
      this.ws.send(JSON.stringify(message));
    }
  }
  
  private async attemptReconnect(): Promise<void> {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[WebSocketSTTClient] Max reconnection attempts reached');
      this.emit('error', 'Failed to reconnect after maximum attempts');
      return;
    }
    
    this.reconnectAttempts++;
    console.log(`[WebSocketSTTClient] Reconnection attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts}`);
    
    setTimeout(async () => {
      try {
        await this.connect();
      } catch (error) {
        console.error('[WebSocketSTTClient] Reconnection failed:', error);
      }
    }, this.reconnectInterval);
  }
  
  private getSupportedMimeType(): string {
    const types = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/ogg;codecs=opus',
      'audio/ogg'
    ];
    
    for (const type of types) {
      if (MediaRecorder.isTypeSupported(type)) {
        console.log('[WebSocketSTTClient] Using MIME type:', type);
        return type;
      }
    }
    
    console.warn('[WebSocketSTTClient] No preferred MIME type supported, using default');
    return '';
  }
}

export default WebSocketSTTClient;
