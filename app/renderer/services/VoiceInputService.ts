import EventEmitter from 'events';
import { VADManager } from './VADManager';

// Define the events that our VoiceInputService will emit
export interface VoiceInputEvents {
  'listening_started': () => void;
  'listening_stopped': () => void;
  'volume_level': (level: number) => void;
  'speech_started': () => void;
  'speech_ended': (audio: Float32Array) => void;
  'error': (error: Error) => void;
}

/**
 * VoiceInputService manages microphone access and uses the VADManager
 * to detect speech. It is responsible for capturing audio when the user
 * is speaking and forwarding that audio for transcription.
 */
export class VoiceInputService extends EventEmitter {
  private isListening = false;
  private isInitialized = false;
  private mediaStream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private vadManager: VADManager;
  private volumeAnimationRequest: number | null = null;

  constructor() {
    super();
    this.vadManager = new VADManager();
    this.setupVADListeners();
  }

  private setupVADListeners(): void {
    this.vadManager.on('speech_start', () => {
      this.emit('speech_started');
    });

    this.vadManager.on('speech_end', (audio) => {
      this.emit('speech_ended', audio);
      // After speech ends, we can stop listening until told to start again.
      this.stopListening();
    });

    this.vadManager.on('error', (error) => {
      this.emit('error', error);
    });
  }

  public async initialize(): Promise<void> {
    if (this.isInitialized) return;
    try {
      await this.getMicrophonePermission();
      await this.vadManager.initialize();
      this.isInitialized = true;
      console.log('[VoiceInputService] Initialized successfully.');
    } catch (error) {
      console.error('[VoiceInputService] Initialization failed:', error);
      this.emit('error', error as Error);
      throw error;
    }
  }

  private async getMicrophonePermission(): Promise<void> {
    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      console.log('[VoiceInputService] Microphone access granted.');
    } catch (error) {
      console.error('[VoiceInputService] Microphone access denied:', error);
      throw new Error('Microphone access was denied. Please grant permission in your browser settings.');
    }
  }

  public async startListening(): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }
    if (this.isListening || !this.mediaStream) return;

    this.isListening = true;
    this.vadManager.start(this.mediaStream);
    this.startVolumeMonitoring();
    this.emit('listening_started');
    console.log('[VoiceInputService] Started listening.');
  }

  public stopListening(): void {
    if (!this.isListening) return;

    this.isListening = false;
    this.vadManager.stop();
    this.stopVolumeMonitoring();
    this.emit('listening_stopped');
    console.log('[VoiceInputService] Stopped listening.');
  }

  private startVolumeMonitoring(): void {
    if (!this.mediaStream) return;

    if (!this.audioContext || this.audioContext.state === 'closed') {
      this.audioContext = new AudioContext();
    }
    if (!this.analyser) {
      this.analyser = this.audioContext.createAnalyser();
      const source = this.audioContext.createMediaStreamSource(this.mediaStream);
      source.connect(this.analyser);
      this.analyser.fftSize = 256;
    }

    const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
    const checkVolume = () => {
      if (!this.isListening || !this.analyser) return;
      this.analyser.getByteFrequencyData(dataArray);
      const volume = dataArray.reduce((sum, value) => sum + value, 0) / dataArray.length / 255;
      this.emit('volume_level', volume);
      this.volumeAnimationRequest = requestAnimationFrame(checkVolume);
    };
    checkVolume();
  }

  private stopVolumeMonitoring(): void {
    if (this.volumeAnimationRequest) {
      cancelAnimationFrame(this.volumeAnimationRequest);
      this.volumeAnimationRequest = null;
    }
  }

  public isCurrentlyListening(): boolean {
    return this.isListening;
  }

  public async destroy(): Promise<void> {
    try {
      this.stopListening();
      
      // Clean up VAD manager
      if (this.vadManager) {
        this.vadManager.destroy();
      }
      
      // Clean up media stream tracks
      if (this.mediaStream) {
        this.mediaStream.getTracks().forEach(track => {
          track.stop();
          track.removeEventListener('ended', () => {});
        });
        this.mediaStream = null;
      }
      
      // Clean up audio context
      if (this.audioContext) {
        if (this.audioContext.state !== 'closed') {
          await this.audioContext.close();
        }
        this.audioContext = null;
      }
      
      // Clean up analyser
      if (this.analyser) {
        this.analyser.disconnect();
        this.analyser = null;
      }
      
      // Clean up animation frame
      if (this.volumeAnimationRequest) {
        cancelAnimationFrame(this.volumeAnimationRequest);
        this.volumeAnimationRequest = null;
      }
      
      // Remove all listeners
      this.removeAllListeners();
      
      // Reset state
      this.isListening = false;
      this.isInitialized = false;
      
      console.log('[VoiceInputService] Destroyed successfully.');
    } catch (error) {
      console.error('[VoiceInputService] Error during destruction:', error);
      throw error;
    }
  }

  // Type-safe event emitter methods
  on<E extends keyof VoiceInputEvents>(event: E, listener: VoiceInputEvents[E]): this {
    return super.on(event, listener);
  }

  emit<E extends keyof VoiceInputEvents>(event: E, ...args: Parameters<VoiceInputEvents[E]>): boolean {
    return super.emit(event, ...args);
  }
}

// Singleton instance management
let voiceInputService: VoiceInputService | null = null;

export function getVoiceInputService(): VoiceInputService {
  if (!voiceInputService) {
    voiceInputService = new VoiceInputService();
  }
  return voiceInputService;
}

export async function destroyVoiceInputService(): Promise<void> {
  if (voiceInputService) {
    await voiceInputService.destroy();
    voiceInputService = null;
  }
}
