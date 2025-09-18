import EventEmitter from 'events';
import { SecurityService } from './SecurityService';
import { API_BASE, apiFetch } from './config';
import { extractText, SttResponse } from './voiceContracts';
import { API } from '../config/endpoints';

// Browser speech APIs (using type assertion where needed)

// Voice Service Events Interface
export interface VoiceServiceEvents {
  'listening_started': () => void;
  'listening_stopped': () => void;
  'tts_started': () => void;
  'tts_ended': () => void;
  'transcription_received': (text: string) => void;
  'volume-level': (level: number) => void;
  'voice-input-error': (error: Error) => void;
  'error': (error: string) => void;
  'recovery-started': (errorType: ErrorType) => void;
  'recovery-completed': (strategy: RecoveryStrategy) => void;
  'recovery-failed': (errorType: ErrorType) => void;
}

// Error Classification
export enum ErrorType {
  MICROPHONE_ACCESS = 'microphone_access',
  AUDIO_CONTEXT = 'audio_context',
  MEDIA_RECORDER = 'media_recorder',
  NETWORK_ERROR = 'network_error',
  API_ERROR = 'api_error',
  TRANSCRIPTION_ERROR = 'transcription_error',
  TTS_ERROR = 'tts_error',
  PERMISSION_DENIED = 'permission_denied',
  BROWSER_COMPATIBILITY = 'browser_compatibility',
  RESOURCE_EXHAUSTED = 'resource_exhausted',
  TIMEOUT = 'timeout',
  UNKNOWN = 'unknown'
}

// Recovery Strategies
export enum RecoveryStrategy {
  RESTART_SERVICE = 'restart_service',
  REINITIALIZE_AUDIO = 'reinitialize_audio',
  SWITCH_PROVIDER = 'switch_provider',
  REQUEST_PERMISSIONS = 'request_permissions',
  FALLBACK_MODE = 'fallback_mode',
  EXPONENTIAL_BACKOFF = 'exponential_backoff',
  NO_RECOVERY = 'no_recovery'
}

interface ErrorContext {
  type: ErrorType;
  originalError: Error;
  timestamp: number;
  recoveryAttempts: number;
  lastRecoveryTime?: number;
  context: Record<string, any>;
}

interface RecoveryPlan {
  strategy: RecoveryStrategy;
  delay: number;
  maxAttempts: number;
  fallbackStrategies: RecoveryStrategy[];
}

interface VoiceConfig {
  sttProvider: 'webSpeechAPI' | 'whisper' | 'multiProvider';
  ttsProvider: 'webSpeechAPI' | 'elevenlabs';
  autoListenAfterSpeaking: boolean;
  enableVAD: boolean;
  enableWakeWord: boolean;
  continuousListening: boolean;
  interruptOnSpeech: boolean;
  maxRecordingTime: number;
  silenceThreshold: number;
  volumeThreshold: number;
}

interface STTProvider {
  initialize(): Promise<void>;
  transcribe(audioData: ArrayBuffer): Promise<string>;
  startContinuousTranscription(onResult: (text: string) => void): Promise<void>;
  stopContinuousTranscription(): Promise<void>;
  isSupported(): boolean;
  cleanup(): void;
}

interface TTSProvider {
  initialize(): Promise<void>;
  speak(text: string, options?: TTSOptions): Promise<void>;
  stop(): void;
  isSupported(): boolean;
  cleanup(): void;
}

interface TTSOptions {
  voice?: string;
  rate?: number;
  pitch?: number;
  volume?: number;
}

/**
 * Production-ready Voice Service with multi-provider STT/TTS support
 * Features: VAD, Wake word, Continuous conversation, Error recovery
 */
export class VoiceService extends EventEmitter {
  private config: VoiceConfig;
  private securityService: SecurityService;
  
  // Core components
  private sttProviders: Map<string, STTProvider> = new Map();
  private ttsProviders: Map<string, TTSProvider> = new Map();
  private currentSTTProvider: STTProvider | null = null;
  private currentTTSProvider: TTSProvider | null = null;
  
  // Audio processing
  private mediaRecorder: MediaRecorder | null = null;
  private audioContext: AudioContext | null = null;
  private analyzerNode: AnalyserNode | null = null;
  private microphone: MediaStreamAudioSourceNode | null = null;
  private vadNode: ScriptProcessorNode | null = null;
  
  // State management
  private isInitialized = false;
  private isListening = false;
  private isSpeaking = false;
  private isProcessing = false;
  private currentStream: MediaStream | null = null;
  private recordingTimeout: NodeJS.Timeout | null = null;
  private silenceTimeout: NodeJS.Timeout | null = null;
  private volumeMonitorInterval: NodeJS.Timeout | null = null;
  
  // Error handling and recovery
  private errorCount = 0;
  private maxRetries = 3;
  private recoveryInProgress = false;
  private errorHistory = new Map<ErrorType, ErrorContext[]>();
  private recoveryPlans = new Map<ErrorType, RecoveryPlan>();
  
  constructor(config?: Partial<VoiceConfig>) {
    super();
    
    this.config = {
      sttProvider: 'multiProvider',
      ttsProvider: 'webSpeechAPI',
      autoListenAfterSpeaking: true,
      enableVAD: true,
      enableWakeWord: false,
      continuousListening: false,
      interruptOnSpeech: true,
      maxRecordingTime: 30000, // 30 seconds
      silenceThreshold: 0.01,
      volumeThreshold: 0.1,
      ...config
    };
    
    this.securityService = new SecurityService();
    this.initializeRecoveryPlans();
    this.setupErrorHandling();
  }
  
  private initializeRecoveryPlans(): void {
    this.recoveryPlans.set(ErrorType.MICROPHONE_ACCESS, {
      strategy: RecoveryStrategy.REQUEST_PERMISSIONS,
      delay: 0,
      maxAttempts: 2,
      fallbackStrategies: [RecoveryStrategy.FALLBACK_MODE]
    });
    
    this.recoveryPlans.set(ErrorType.AUDIO_CONTEXT, {
      strategy: RecoveryStrategy.REINITIALIZE_AUDIO,
      delay: 1000,
      maxAttempts: 3,
      fallbackStrategies: [RecoveryStrategy.RESTART_SERVICE]
    });
    
    this.recoveryPlans.set(ErrorType.NETWORK_ERROR, {
      strategy: RecoveryStrategy.EXPONENTIAL_BACKOFF,
      delay: 2000,
      maxAttempts: 5,
      fallbackStrategies: [RecoveryStrategy.SWITCH_PROVIDER]
    });
    
    this.recoveryPlans.set(ErrorType.API_ERROR, {
      strategy: RecoveryStrategy.SWITCH_PROVIDER,
      delay: 1000,
      maxAttempts: 2,
      fallbackStrategies: [RecoveryStrategy.FALLBACK_MODE]
    });
    
    this.recoveryPlans.set(ErrorType.TRANSCRIPTION_ERROR, {
      strategy: RecoveryStrategy.SWITCH_PROVIDER,
      delay: 500,
      maxAttempts: 3,
      fallbackStrategies: [RecoveryStrategy.FALLBACK_MODE]
    });
    
    this.recoveryPlans.set(ErrorType.TTS_ERROR, {
      strategy: RecoveryStrategy.SWITCH_PROVIDER,
      delay: 500,
      maxAttempts: 2,
      fallbackStrategies: [RecoveryStrategy.FALLBACK_MODE]
    });
    
    this.recoveryPlans.set(ErrorType.TIMEOUT, {
      strategy: RecoveryStrategy.EXPONENTIAL_BACKOFF,
      delay: 1000,
      maxAttempts: 3,
      fallbackStrategies: [RecoveryStrategy.RESTART_SERVICE]
    });
    
    this.recoveryPlans.set(ErrorType.RESOURCE_EXHAUSTED, {
      strategy: RecoveryStrategy.EXPONENTIAL_BACKOFF,
      delay: 5000,
      maxAttempts: 2,
      fallbackStrategies: [RecoveryStrategy.RESTART_SERVICE]
    });
  }

  public async initialize(): Promise<void> {
    if (this.isInitialized) return;
    
    try {
      console.log('[VoiceService] Initializing...');
      
      // Initialize security service
      await this.securityService.initialize();
      
      // Initialize audio context
      await this.initializeAudioContext();
      
      // Initialize STT providers
      await this.initializeSTTProviders();
      
      // Initialize TTS providers
      await this.initializeTTSProviders();
      
      // Select best providers
      await this.selectProviders();
      
      this.isInitialized = true;
      console.log('[VoiceService] Successfully initialized');
      
    } catch (error) {
      console.error('[VoiceService] Initialization failed:', error);
      this.emit('error', `Voice service initialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    }
  }

  /**
   * Transcribe audio blob to text using voice service
   */
  public async transcribe(audio: Blob): Promise<string> {
    const form = new FormData();
    const name =
      audio.type?.includes("webm") ? "clip.webm" :
      audio.type?.includes("wav")  ? "clip.wav"  :
      "clip.webm";
    form.append("file", audio, name);
    
    try {
      const response = await apiFetch(API.STT_TRANSCRIBE, {
        method: 'POST',
        body: form
      });
      
      if (!response.ok) {
        throw new Error(`STT failed: ${response.status}`);
      }
      
      const payload = (await response.json()) as SttResponse;
      const transcript = extractText(payload);
      if (!transcript) {
        throw new Error('STT returned empty text');
      }
      return transcript;
    } catch (error) {
      console.error('[VoiceService] Transcribe error:', error);
      throw error;
    }
  }

  /**
   * Synthesize text to audio blob using voice service
   */
  public async synthesize(text: string): Promise<Blob> {
    try {
      const response = await apiFetch(API.TTS_SYNTHESIZE, {
        method: 'POST',
        body: { text }
      });
      
      if (!response.ok) {
        throw new Error(`TTS failed: ${response.status}`);
      }
      
      const buffer = await response.arrayBuffer();
      return new Blob([buffer], { type: 'audio/wav' });
    } catch (error) {
      console.error('[VoiceService] Synthesize error:', error);
      throw error;
    }
  }

  private async initializeAudioContext(): Promise<void> {
    try {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }
      
      console.log('[VoiceService] Audio context initialized');
    } catch (error) {
      throw new Error(`Failed to initialize audio context: ${error}`);
    }
  }

  private async initializeSTTProviders(): Promise<void> {
    // Web Speech API STT Provider
    const webSpeechSTT = new WebSpeechSTTProvider();
    if (webSpeechSTT.isSupported()) {
      await webSpeechSTT.initialize();
      this.sttProviders.set('webSpeechAPI', webSpeechSTT);
      console.log('[VoiceService] Web Speech API STT provider initialized');
    }
    
    // Whisper API STT Provider (requires backend) - Gate behind environment flag
    // Note: In renderer process, we don't have direct access to process.env
    // So we'll try to initialize and let it fail gracefully if not available
    const whisperSTT = new WhisperSTTProvider();
    try {
      if (whisperSTT.isSupported()) {
        await whisperSTT.initialize();
        this.sttProviders.set('whisper', whisperSTT);
        console.log('[VoiceService] Whisper STT provider initialized');
      }
    } catch (error) {
      console.warn('[VoiceService] Whisper STT provider failed to initialize (this is normal if backend is not configured for Whisper):', error);
    }
  }

  private async initializeTTSProviders(): Promise<void> {
    // Web Speech API TTS Provider
    const webSpeechTTS = new WebSpeechTTSProvider();
    if (webSpeechTTS.isSupported()) {
      await webSpeechTTS.initialize();
      this.ttsProviders.set('webSpeechAPI', webSpeechTTS);
      console.log('[VoiceService] Web Speech API TTS provider initialized');
    }
    
    // ElevenLabs TTS Provider
    const elevenLabsTTS = new ElevenLabsTTSProvider();
    try {
      if (elevenLabsTTS.isSupported()) {
        await elevenLabsTTS.initialize();
        this.ttsProviders.set('elevenlabs', elevenLabsTTS);
        console.log('[VoiceService] ElevenLabs TTS provider initialized');
      }
    } catch (error) {
      console.warn('[VoiceService] ElevenLabs TTS provider failed to initialize:', error);
    }
  }

  private async selectProviders(): Promise<void> {
    // Select STT provider
    if (this.config.sttProvider === 'multiProvider') {
      // Use the best available provider
      this.currentSTTProvider = this.sttProviders.get('whisper') || this.sttProviders.get('webSpeechAPI') || null;
    } else {
      this.currentSTTProvider = this.sttProviders.get(this.config.sttProvider) || null;
    }
    
    if (!this.currentSTTProvider) {
      throw new Error('No STT provider available');
    }
    
    // Select TTS provider
    this.currentTTSProvider = this.ttsProviders.get(this.config.ttsProvider) || null;
    
    if (!this.currentTTSProvider) {
      throw new Error('No TTS provider available');
    }
    
    console.log('[VoiceService] Providers selected:', {
      stt: this.config.sttProvider,
      tts: this.config.ttsProvider
    });
  }

  public async startListening(): Promise<void> {
    if (this.isListening || this.isSpeaking) {
      console.log('[VoiceService] Already listening or speaking, ignoring start request');
      return;
    }
    
    try {
      this.isListening = true;
      this.emit('listening_started');
      
      // Get microphone access
      this.currentStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 44100
        }
      });
      
      // Set up audio analysis for VAD and volume monitoring
      await this.setupAudioAnalysis();
      
      // Start recording
      await this.startRecording();
      
      // Set maximum recording time
      this.recordingTimeout = setTimeout(() => {
        this.stopListening('Timeout reached');
      }, this.config.maxRecordingTime);
      
      console.log('[VoiceService] Started listening');
      
    } catch (error) {
      this.isListening = false;
      this.emit('listening_stopped');
      
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      console.error('[VoiceService] Failed to start listening:', errorMsg);
      this.emit('voice-input-error', new Error(errorMsg));
      
      await this.handleError(error as Error, { 
        operation: 'startListening',
        config: this.config 
      });
    }
  }

  public async stopListening(reason = 'User request'): Promise<void> {
    if (!this.isListening) return;
    
    try {
      this.isListening = false;
      
      // Clear timeouts
      if (this.recordingTimeout) {
        clearTimeout(this.recordingTimeout);
        this.recordingTimeout = null;
      }
      
      if (this.silenceTimeout) {
        clearTimeout(this.silenceTimeout);
        this.silenceTimeout = null;
      }
      
      // Stop recording
      if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
        this.mediaRecorder.stop();
      }
      
      // Clean up audio analysis
      this.cleanupAudioAnalysis();
      
      // Close media stream
      if (this.currentStream) {
        this.currentStream.getTracks().forEach(track => track.stop());
        this.currentStream = null;
      }
      
      this.emit('listening_stopped');
      console.log(`[VoiceService] Stopped listening: ${reason}`);
      
    } catch (error) {
      console.error('[VoiceService] Error stopping listening:', error);
    }
  }

  private async setupAudioAnalysis(): Promise<void> {
    if (!this.audioContext || !this.currentStream) return;
    
    // Create audio nodes
    this.microphone = this.audioContext.createMediaStreamSource(this.currentStream);
    this.analyzerNode = this.audioContext.createAnalyser();
    
    // Configure analyzer
    this.analyzerNode.fftSize = 2048;
    this.analyzerNode.smoothingTimeConstant = 0.8;
    
    // Connect nodes
    this.microphone.connect(this.analyzerNode);
    
    // Start volume monitoring
    this.startVolumeMonitoring();
    
    // Set up VAD if enabled
    if (this.config.enableVAD) {
      this.setupVAD();
    }
  }

  private startVolumeMonitoring(): void {
    if (!this.analyzerNode) return;
    
    const bufferLength = this.analyzerNode.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    
    this.volumeMonitorInterval = setInterval(() => {
      if (!this.analyzerNode || !this.isListening) return;
      
      this.analyzerNode.getByteFrequencyData(dataArray);
      
      // Calculate RMS volume
      let sum = 0;
      for (let i = 0; i < bufferLength; i++) {
        sum += (dataArray[i] / 255) ** 2;
      }
      const rms = Math.sqrt(sum / bufferLength);
      
      // Emit volume level for visualizations
      this.emit('volume-level', rms);
      
      // VAD logic
      if (this.config.enableVAD) {
        this.processVAD(rms);
      }
      
    }, 100); // Update 10 times per second
  }

  private setupVAD(): void {
    // Voice Activity Detection using simple energy-based method
    // In production, consider using more sophisticated VAD like @ricky0123/vad-web
  }

  private processVAD(volume: number): void {
    const isSpeaking = volume > this.config.volumeThreshold;
    
    if (isSpeaking) {
      // Speech detected, cancel any silence timeout
      if (this.silenceTimeout) {
        clearTimeout(this.silenceTimeout);
        this.silenceTimeout = null;
      }
    } else {
      // Silence detected, start timeout if not already started
      if (!this.silenceTimeout && this.isListening) {
        this.silenceTimeout = setTimeout(() => {
          if (this.isListening) {
            this.stopListening('Silence timeout');
          }
        }, 2000); // 2 seconds of silence
      }
    }
  }

  private async startRecording(): Promise<void> {
    if (!this.currentStream) throw new Error('No audio stream available');
    
    const recordedChunks: BlobPart[] = [];
    
    this.mediaRecorder = new MediaRecorder(this.currentStream, {
      mimeType: 'audio/webm;codecs=opus'
    });
    
    this.mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        recordedChunks.push(event.data);
      }
    };
    
    this.mediaRecorder.onstop = async () => {
      try {
        const audioBlob = new Blob(recordedChunks, { type: 'audio/webm' });
        const arrayBuffer = await audioBlob.arrayBuffer();
        
        // Security check - validate audio data
        if (!this.securityService.validateAudioData(arrayBuffer)) {
          throw new Error('Audio data validation failed');
        }
        
        // Transcribe audio
        this.isProcessing = true;
        const transcript = await this.transcribeAudio(arrayBuffer);
        
        if (transcript && transcript.trim()) {
          console.log('[VoiceService] Transcription:', transcript);
          this.emit('transcription_received', transcript);
        }
        
      } catch (error) {
        console.error('[VoiceService] Recording processing error:', error);
        this.emit('voice-input-error', error as Error);
      } finally {
        this.isProcessing = false;
      }
    };
    
    this.mediaRecorder.start();
  }

  private async transcribeAudio(audioData: ArrayBuffer): Promise<string> {
    if (!this.currentSTTProvider) {
      throw new Error('No STT provider available');
    }
    
    try {
      return await this.currentSTTProvider.transcribe(audioData);
    } catch (error) {
      console.error('[VoiceService] Transcription failed:', error);
      
      // Try fallback provider
      const fallbackProvider = this.sttProviders.get('webSpeechAPI');
      if (fallbackProvider && fallbackProvider !== this.currentSTTProvider) {
        try {
          console.log('[VoiceService] Trying fallback STT provider');
          return await fallbackProvider.transcribe(audioData);
        } catch (fallbackError) {
          console.error('[VoiceService] Fallback transcription failed:', fallbackError);
        }
      }
      
      throw error;
    }
  }

  public async speak(text: string, options?: TTSOptions): Promise<void> {
    if (!this.currentTTSProvider) {
      throw new Error('No TTS provider available');
    }
    
    if (this.isSpeaking) {
      this.stopAudio();
    }
    
    try {
      // Security check - validate text
      const sanitizedText = this.securityService.sanitizeText(text);
      
      this.isSpeaking = true;
      this.emit('tts_started');
      
      await this.currentTTSProvider.speak(sanitizedText, options);
      
    } catch (error) {
      console.error('[VoiceService] TTS error:', error);
      this.emit('error', `Speech synthesis failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      this.isSpeaking = false;
      this.emit('tts_ended');
      
      // Auto-listen after speaking if enabled
      if (this.config.autoListenAfterSpeaking && !this.isListening) {
        setTimeout(() => {
          if (!this.isListening && !this.isSpeaking) {
            this.startListening().catch(console.error);
          }
        }, 500);
      }
    }
  }

  public stopAudio(): void {
    if (this.currentTTSProvider) {
      this.currentTTSProvider.stop();
    }
    this.isSpeaking = false;
    this.emit('tts_ended');
  }

  // Chat integration methods
  public async chatWithTTS(message: string): Promise<string> {
    try {
      const response = await this.sendMessageToAgent(message);
      await this.speak(response);
      return response;
    } catch (error) {
      console.error('[VoiceService] Chat with TTS failed:', error);
      throw error;
    }
  }

  public async chatWithStreaming(
    message: string,
    onToken: (token: string) => void,
    onComplete?: (fullResponse: string) => void
  ): Promise<void> {
    try {
      let fullResponse = '';
      
      const response = await fetch(`${API_BASE}/api/agent/chat/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: [{ role: 'user', content: message }],
          model: 'gpt-4o-2024-08-06'
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body reader');

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.text) {
                onToken(data.text);
                fullResponse += data.text;
              }
            } catch (parseError) {
              console.warn('[VoiceService] Failed to parse SSE data:', parseError);
            }
          }
        }
      }

      // Speak the complete response
      if (fullResponse.trim()) {
        await this.speak(fullResponse);
      }

      if (onComplete) {
        onComplete(fullResponse);
      }

    } catch (error) {
      console.error('[VoiceService] Streaming chat failed:', error);
      throw error;
    }
  }

  private async sendMessageToAgent(message: string): Promise<string> {
    const response = await fetch(`${API_BASE}/api/agent/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message,
        mode: 'conversational',
        useTools: true
      })
    });

    if (!response.ok) {
      throw new Error(`Agent API error: ${response.status}`);
    }

    const data = await response.json();
    return data.response || data.content || 'No response received';
  }

  private cleanupAudioAnalysis(): void {
    try {
      if (this.volumeMonitorInterval) {
        clearInterval(this.volumeMonitorInterval);
        this.volumeMonitorInterval = null;
      }
      
      if (this.vadNode) {
        this.vadNode.onaudioprocess = null;
        this.vadNode.disconnect();
        this.vadNode = null;
      }
      
      if (this.microphone) {
        this.microphone.disconnect();
        this.microphone = null;
      }
      
      if (this.analyzerNode) {
        this.analyzerNode.disconnect();
        this.analyzerNode = null;
      }
    } catch (error) {
      console.warn('[VoiceService] Error during audio analysis cleanup:', error);
    }
  }

  private setupErrorHandling(): void {
    this.on('voice-input-error', (error) => {
      this.handleError(error).catch(console.error);
    });

    // Handle unexpected errors - browser-safe version
    if (typeof window !== 'undefined') {
      window.addEventListener('error', (event) => {
        if (event.error && event.error.message && 
            (event.error.message.includes('voice') || event.error.message.includes('audio'))) {
          this.handleError(event.error).catch(console.error);
        }
      });
    }
  }

  private classifyError(error: Error, context?: Record<string, any>): ErrorType {
    const message = error.message.toLowerCase();
    const name = error.name.toLowerCase();
    
    // Microphone and permissions
    if (message.includes('permission denied') || 
        message.includes('microphone') ||
        message.includes('getusermedia') ||
        name.includes('notallowederror')) {
      return ErrorType.PERMISSION_DENIED;
    }
    
    // Audio context issues
    if (message.includes('audiocontext') || 
        message.includes('audio context') ||
        message.includes('decodeaudiodata') ||
        name.includes('invalidstateerror')) {
      return ErrorType.AUDIO_CONTEXT;
    }
    
    // Media recorder issues
    if (message.includes('mediarecorder') || 
        message.includes('media recorder') ||
        name.includes('notsupportederror')) {
      return ErrorType.MEDIA_RECORDER;
    }
    
    // Network and connectivity
    if (message.includes('network') || 
        message.includes('fetch') ||
        message.includes('connection') ||
        message.includes('cors') ||
        name.includes('networkerror')) {
      return ErrorType.NETWORK_ERROR;
    }
    
    // API errors (status codes, rate limits)
    if (message.includes('api error') || 
        message.includes('status') ||
        message.includes('rate limit') ||
        message.includes('quota') ||
        message.includes('429') ||
        message.includes('401') ||
        message.includes('403')) {
      return ErrorType.API_ERROR;
    }
    
    // Transcription specific
    if (message.includes('transcription') || 
        message.includes('speech recognition') ||
        message.includes('whisper') ||
        message.includes('stt')) {
      return ErrorType.TRANSCRIPTION_ERROR;
    }
    
    // TTS specific
    if (message.includes('speech synthesis') || 
        message.includes('tts') ||
        message.includes('elevenlabs')) {
      return ErrorType.TTS_ERROR;
    }
    
    // Timeout errors
    if (message.includes('timeout') || 
        message.includes('timed out') ||
        name.includes('timeouterror')) {
      return ErrorType.TIMEOUT;
    }
    
    // Resource exhaustion
    if (message.includes('out of memory') || 
        message.includes('resource') ||
        message.includes('quota exceeded')) {
      return ErrorType.RESOURCE_EXHAUSTED;
    }
    
    // Browser compatibility
    if (message.includes('not supported') || 
        message.includes('unsupported') ||
        name.includes('notsupportederror')) {
      return ErrorType.BROWSER_COMPATIBILITY;
    }
    
    return ErrorType.UNKNOWN;
  }
  
  private recordError(errorType: ErrorType, error: Error, context?: Record<string, any>): void {
    if (!this.errorHistory.has(errorType)) {
      this.errorHistory.set(errorType, []);
    }
    
    const errorContext: ErrorContext = {
      type: errorType,
      originalError: error,
      timestamp: Date.now(),
      recoveryAttempts: 0,
      context: context || {}
    };
    
    const history = this.errorHistory.get(errorType)!;
    history.push(errorContext);
    
    // Keep only recent errors (last 10)
    if (history.length > 10) {
      history.shift();
    }
  }
  
  private shouldAttemptRecovery(errorType: ErrorType): boolean {
    const history = this.errorHistory.get(errorType) || [];
    const recentErrors = history.filter(err => 
      Date.now() - err.timestamp < 300000 // Last 5 minutes
    );
    
    // Don't recover if too many recent errors of the same type
    if (recentErrors.length >= 5) {
      return false;
    }
    
    // Don't recover if already in progress
    if (this.recoveryInProgress) {
      return false;
    }
    
    // Some error types shouldn't trigger automatic recovery
    if (errorType === ErrorType.PERMISSION_DENIED || 
        errorType === ErrorType.BROWSER_COMPATIBILITY) {
      return false;
    }
    
    return true;
  }
  
  private async executeRecoveryStrategy(strategy: RecoveryStrategy, errorType: ErrorType, context: ErrorContext): Promise<boolean> {
    console.log(`[VoiceService] Executing recovery strategy: ${strategy} for error: ${errorType}`);
    
    try {
      switch (strategy) {
        case RecoveryStrategy.RESTART_SERVICE:
          await this.stopListening('Recovery restart');
          this.cleanupAudioAnalysis();
          await new Promise(resolve => setTimeout(resolve, 1000));
          await this.initialize();
          return true;
          
        case RecoveryStrategy.REINITIALIZE_AUDIO:
          await this.initializeAudioContext();
          return true;
          
        case RecoveryStrategy.SWITCH_PROVIDER:
          return await this.switchToFallbackProvider(errorType);
          
        case RecoveryStrategy.REQUEST_PERMISSIONS:
          // This would typically require user interaction
          console.warn('[VoiceService] Permission request needed - user action required');
          this.emit('error', 'Microphone permission required. Please allow access and try again.');
          return false;
          
        case RecoveryStrategy.EXPONENTIAL_BACKOFF:
          const delay = Math.min(1000 * Math.pow(2, context.recoveryAttempts), 30000);
          await new Promise(resolve => setTimeout(resolve, delay));
          return true;
          
        case RecoveryStrategy.FALLBACK_MODE:
          return this.enableFallbackMode(errorType);
          
        default:
          return false;
      }
    } catch (recoveryError) {
      console.error('[VoiceService] Recovery strategy failed:', recoveryError);
      return false;
    }
  }
  
  private async switchToFallbackProvider(errorType: ErrorType): Promise<boolean> {
    try {
      if (errorType === ErrorType.TRANSCRIPTION_ERROR) {
        // Switch STT provider
        const currentProvider = this.config.sttProvider;
        if (currentProvider === 'whisper') {
          this.config.sttProvider = 'webSpeechAPI';
        } else if (currentProvider === 'webSpeechAPI') {
          this.config.sttProvider = 'multiProvider';
        }
        await this.initializeSTTProviders();
        await this.selectProviders();
        return true;
      }
      
      if (errorType === ErrorType.TTS_ERROR) {
        // Switch TTS provider
        const currentProvider = this.config.ttsProvider;
        if (currentProvider === 'elevenlabs') {
          this.config.ttsProvider = 'webSpeechAPI';
        }
        await this.initializeTTSProviders();
        await this.selectProviders();
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('[VoiceService] Failed to switch provider:', error);
      return false;
    }
  }
  
  private enableFallbackMode(errorType: ErrorType): boolean {
    console.log(`[VoiceService] Enabling fallback mode for error: ${errorType}`);
    
    // Disable advanced features and use basic functionality
    this.config.enableVAD = false;
    this.config.enableWakeWord = false;
    this.config.continuousListening = false;
    
    this.emit('error', 'Voice service running in reduced functionality mode');
    return true;
  }
  
  private async handleError(error: Error, context?: Record<string, any>): Promise<void> {
    const errorType = this.classifyError(error, context);
    console.error(`[VoiceService] Classified error as ${errorType}:`, error);
    
    this.recordError(errorType, error, context);
    
    if (!this.shouldAttemptRecovery(errorType)) {
      console.warn(`[VoiceService] Recovery not attempted for error type: ${errorType}`);
      this.emit('error', `Voice service error: ${error.message}`);
      return;
    }
    
    this.recoveryInProgress = true;
    this.emit('recovery-started', errorType);
    
    const recoveryPlan = this.recoveryPlans.get(errorType);
    if (!recoveryPlan) {
      console.error(`[VoiceService] No recovery plan for error type: ${errorType}`);
      this.emit('recovery-failed', errorType);
      this.recoveryInProgress = false;
      return;
    }
    
    const errorContext = this.errorHistory.get(errorType)?.slice(-1)[0];
    if (!errorContext) {
      this.recoveryInProgress = false;
      return;
    }
    
    // Try primary strategy
    let recoverySuccessful = false;
    if (errorContext.recoveryAttempts < recoveryPlan.maxAttempts) {
      errorContext.recoveryAttempts++;
      errorContext.lastRecoveryTime = Date.now();
      
      await new Promise(resolve => setTimeout(resolve, recoveryPlan.delay));
      recoverySuccessful = await this.executeRecoveryStrategy(recoveryPlan.strategy, errorType, errorContext);
    }
    
    // Try fallback strategies if primary failed
    if (!recoverySuccessful && recoveryPlan.fallbackStrategies.length > 0) {
      for (const fallbackStrategy of recoveryPlan.fallbackStrategies) {
        console.log(`[VoiceService] Trying fallback strategy: ${fallbackStrategy}`);
        recoverySuccessful = await this.executeRecoveryStrategy(fallbackStrategy, errorType, errorContext);
        if (recoverySuccessful) break;
      }
    }
    
    if (recoverySuccessful) {
      console.log(`[VoiceService] Recovery successful for error type: ${errorType}`);
      this.emit('recovery-completed', recoveryPlan.strategy);
      this.errorCount = 0;
    } else {
      console.error(`[VoiceService] Recovery failed for error type: ${errorType}`);
      this.emit('recovery-failed', errorType);
      this.emit('error', `Voice service recovery failed: ${error.message}`);
    }
    
    this.recoveryInProgress = false;
  }

  public async destroy(): Promise<void> {
    console.log('[VoiceService] Destroying...');
    
    try {
      // Stop all activities
      await this.stopListening('Service destroying');
      this.stopAudio();
      
      // Clean up all timeouts
      if (this.recordingTimeout) {
        clearTimeout(this.recordingTimeout);
        this.recordingTimeout = null;
      }
      
      if (this.silenceTimeout) {
        clearTimeout(this.silenceTimeout);
        this.silenceTimeout = null;
      }
      
      // Clean up media recorder
      if (this.mediaRecorder) {
        if (this.mediaRecorder.state === 'recording' || this.mediaRecorder.state === 'paused') {
          this.mediaRecorder.stop();
        }
        this.mediaRecorder.ondataavailable = null;
        this.mediaRecorder.onstop = null;
        this.mediaRecorder.onerror = null;
        this.mediaRecorder = null;
      }
      
      // Clean up audio analysis
      this.cleanupAudioAnalysis();
      
      // Close media streams properly
      if (this.currentStream) {
        this.currentStream.getTracks().forEach(track => {
          track.stop();
          track.removeEventListener('ended', () => {});
        });
        this.currentStream = null;
      }
      
      // Close audio context
      if (this.audioContext) {
        if (this.audioContext.state !== 'closed') {
          await this.audioContext.close();
        }
        this.audioContext = null;
      }
      
      // Clean up providers
      this.sttProviders.forEach(provider => {
        try {
          provider.cleanup();
        } catch (error) {
          console.warn('[VoiceService] Provider cleanup error:', error);
        }
      });
      this.sttProviders.clear();
      
      this.ttsProviders.forEach(provider => {
        try {
          provider.cleanup();
        } catch (error) {
          console.warn('[VoiceService] Provider cleanup error:', error);
        }
      });
      this.ttsProviders.clear();
      
      // Clean up security service
      if (this.securityService) {
        try {
          this.securityService.cleanup();
        } catch (error) {
          console.warn('[VoiceService] Security service cleanup error:', error);
        }
      }
      
      // Remove all listeners
      this.removeAllListeners();
      
      // Reset state
      this.isInitialized = false;
      this.isListening = false;
      this.isSpeaking = false;
      this.isProcessing = false;
      this.errorCount = 0;
      this.recoveryInProgress = false;
      
      console.log('[VoiceService] Destroyed successfully');
    } catch (error) {
      console.error('[VoiceService] Error during destruction:', error);
      throw error;
    }
  }

  // Getters for state
  public get isListeningActive(): boolean { return this.isListening; }
  public get isSpeakingActive(): boolean { return this.isSpeaking; }
  public get isProcessingActive(): boolean { return this.isProcessing; }
  public get isInitializedState(): boolean { return this.isInitialized; }
  public get currentConfig(): VoiceConfig { return { ...this.config }; }
}

// STT Provider Implementations
class WebSpeechSTTProvider implements STTProvider {
  private recognition: SpeechRecognition | null = null;
  
  isSupported(): boolean {
    return 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window;
  }
  
  async initialize(): Promise<void> {
    if (!this.isSupported()) {
      throw new Error('Web Speech API not supported');
    }
    
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    this.recognition = new SpeechRecognition();
    
    if (this.recognition) {
      this.recognition.continuous = false;
      this.recognition.interimResults = false;
      this.recognition.lang = 'en-US';
    }
  }
  
  async transcribe(audioData: ArrayBuffer): Promise<string> {
    // Web Speech API doesn't support direct audio buffer transcription
    // This would need to be implemented differently or use a different approach
    throw new Error('Direct audio buffer transcription not supported by Web Speech API');
  }
  
  async startContinuousTranscription(onResult: (text: string) => void): Promise<void> {
    if (!this.recognition) throw new Error('Recognition not initialized');
    
    this.recognition.continuous = true;
    this.recognition.onresult = (event: any) => {
      const result = event.results[event.results.length - 1];
      if (result.isFinal) {
        onResult(result[0].transcript);
      }
    };
    
    this.recognition.start();
  }
  
  async stopContinuousTranscription(): Promise<void> {
    if (this.recognition) {
      this.recognition.stop();
    }
  }
  
  cleanup(): void {
    if (this.recognition) {
      this.recognition.abort();
      this.recognition = null;
    }
  }
}

class WhisperSTTProvider implements STTProvider {
  private apiEndpoint = `${API_BASE}${API.STT_TRANSCRIBE}`;
  
  isSupported(): boolean {
    return true; // Assume backend support
  }
  
  async initialize(): Promise<void> {
    // Test connection to backend
    try {
      const response = await fetch(`${API_BASE}/health`);
      if (!response.ok) {
        throw new Error('Backend not available');
      }
    } catch (error) {
      throw new Error('Whisper backend not available');
    }
  }
  
  async transcribe(audioData: ArrayBuffer): Promise<string> {
    const formData = new FormData();
    const audioBlob = new Blob([audioData], { type: 'audio/webm' });
    formData.append('file', audioBlob, 'recording.webm');
    
    const response = await fetch(this.apiEndpoint, {
      method: 'POST',
      body: formData
    });
    
    if (!response.ok) {
      throw new Error(`Whisper API error: ${response.status}`);
    }
    
    const result = await response.json();
    return result.text || result.transcript || '';
  }
  
  async startContinuousTranscription(onResult: (text: string) => void): Promise<void> {
    // Continuous transcription would require WebSocket implementation
    throw new Error('Continuous transcription not implemented for Whisper provider');
  }
  
  async stopContinuousTranscription(): Promise<void> {
    // No-op for this implementation
  }
  
  cleanup(): void {
    // No cleanup needed
  }
}

// TTS Provider Implementations
class WebSpeechTTSProvider implements TTSProvider {
  private synthesis: SpeechSynthesis;
  
  constructor() {
    this.synthesis = window.speechSynthesis;
  }
  
  isSupported(): boolean {
    return 'speechSynthesis' in window;
  }
  
  async initialize(): Promise<void> {
    // No initialization needed for Web Speech API
  }
  
  async speak(text: string, options: TTSOptions = {}): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.synthesis) {
        reject(new Error('Speech synthesis not available'));
        return;
      }
      
      // Cancel any ongoing speech
      this.synthesis.cancel();
      
      const utterance = new SpeechSynthesisUtterance(text);
      
      // Set options
      utterance.rate = options.rate || 1.0;
      utterance.pitch = options.pitch || 1.0;
      utterance.volume = options.volume || 1.0;
      
      // Select voice
      const voices = this.synthesis.getVoices();
      if (options.voice && voices.length > 0) {
        const selectedVoice = voices.find(voice => voice.name.includes(options.voice!));
        if (selectedVoice) {
          utterance.voice = selectedVoice;
        }
      }
      
      utterance.onend = () => resolve();
      utterance.onerror = (error) => reject(error);
      
      this.synthesis.speak(utterance);
    });
  }
  
  stop(): void {
    if (this.synthesis) {
      this.synthesis.cancel();
    }
  }
  
  cleanup(): void {
    this.stop();
  }
}

class ElevenLabsTTSProvider implements TTSProvider {
  private apiKey: string | null = null;
  private apiEndpoint = `${API_BASE}${API.TTS_SYNTHESIZE}`;
  
  isSupported(): boolean {
    return true; // Check will be done in initialize
  }
  
  async initialize(): Promise<void> {
    // Check if ElevenLabs is configured with proper 404 handling
    try {
      const res = await fetch(`${API_BASE}${API.TTS_CHECK}`).catch(() => null);
      if (res?.ok) {
        // ElevenLabs is available
        console.log('ElevenLabs TTS provider available');
      } else {
        // Skip provider - endpoint not available or not configured
        throw new Error('ElevenLabs endpoint not available');
      }
    } catch (error) {
      throw new Error('ElevenLabs TTS not available');
    }
  }
  
  async speak(text: string, options: TTSOptions = {}): Promise<void> {
    try {
      const response = await fetch(this.apiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text,
          voice: options.voice || 'default',
          settings: {
            stability: 0.75,
            similarity_boost: 0.75
          }
        })
      });
      
      if (!response.ok) {
        throw new Error(`ElevenLabs API error: ${response.status}`);
      }
      
      const audioBlob = await response.blob();
      await this.playAudioBlob(audioBlob);
      
    } catch (error) {
      console.error('[ElevenLabsTTS] Error:', error);
      throw error;
    }
  }
  
  private currentAudioElement: HTMLAudioElement | null = null;
  private currentAudioUrl: string | null = null;
  
  private async playAudioBlob(audioBlob: Blob): Promise<void> {
    return new Promise((resolve, reject) => {
      // Clean up previous audio element
      this.cleanupCurrentAudio();
      
      const audio = new Audio();
      const url = URL.createObjectURL(audioBlob);
      
      // Store references for cleanup
      this.currentAudioElement = audio;
      this.currentAudioUrl = url;
      
      audio.src = url;
      
      const cleanup = () => {
        if (url === this.currentAudioUrl) {
          URL.revokeObjectURL(url);
          this.currentAudioUrl = null;
          this.currentAudioElement = null;
        }
      };
      
      audio.onended = () => {
        cleanup();
        resolve();
      };
      
      audio.onerror = (error) => {
        cleanup();
        reject(error);
      };
      
      // Handle page unload cleanup
      const unloadHandler = () => {
        cleanup();
        window.removeEventListener('beforeunload', unloadHandler);
      };
      window.addEventListener('beforeunload', unloadHandler);
      
      audio.play().catch((error) => {
        cleanup();
        reject(error);
      });
    });
  }
  
  private cleanupCurrentAudio(): void {
    if (this.currentAudioElement) {
      this.currentAudioElement.pause();
      this.currentAudioElement.src = '';
      this.currentAudioElement.load();
      this.currentAudioElement = null;
    }
    
    if (this.currentAudioUrl) {
      URL.revokeObjectURL(this.currentAudioUrl);
      this.currentAudioUrl = null;
    }
  }
  
  stop(): void {
    if (this.currentAudioElement) {
      this.currentAudioElement.pause();
      this.currentAudioElement.src = '';
      this.currentAudioElement.load();
    }
  }
  
  cleanup(): void {
    this.cleanupCurrentAudio();
  }
}

// Singleton instance
let voiceServiceInstance: VoiceService | null = null;

export function getVoiceService(): VoiceService {
  if (!voiceServiceInstance) {
    voiceServiceInstance = new VoiceService();
  }
  return voiceServiceInstance;
}

export async function destroyVoiceService(): Promise<void> {
  if (voiceServiceInstance) {
    await voiceServiceInstance.destroy();
    voiceServiceInstance = null;
  }
}
