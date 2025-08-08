/**
 * Voice Input Service for Renderer Process
 * Handles speech recognition using Web Speech API
 * Replaces main process voice input to access getUserMedia properly
 */

import { errorHandler } from './ErrorHandler';
import { getCircuitBreakerService } from './CircuitBreakerService';

interface VoiceInputConfig {
  language?: string;
  continuous?: boolean;
  interimResults?: boolean;
  maxAlternatives?: number;
  silenceDuration?: number;
}

interface TranscriptionResult {
  text: string;
  confidence: number;
  isFinal: boolean;
  alternatives?: Array<{ text: string; confidence: number }>;
  timestamp?: number;
}

export class VoiceInputService {
  private recognition: any = null;
  private isListening: boolean = false;
  private isInitialized: boolean = false;
  private config: VoiceInputConfig;
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private analyser: AnalyserNode | null = null;
  private volumeCallback: ((level: number) => void) | null = null;
  private silenceTimeout: NodeJS.Timeout | null = null;
  private retryCount: number = 0;
  private maxRetries: number = 3;
  private retryTimeout: NodeJS.Timeout | null = null;
  private lastError: string | null = null;
  private isNetworkAvailable: boolean = true;
  private circuitBreaker = getCircuitBreakerService();
  private offlineModeEnabled: boolean = false;

  constructor(config: VoiceInputConfig = {}) {
    this.config = {
      language: 'en-US',
      continuous: true,
      interimResults: true,
      maxAlternatives: 1,
      silenceDuration: 1500,
      ...config
    };
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      // Check for Web Speech API support
      if (!this.isWebSpeechAvailable()) {
        throw new Error('Web Speech API not supported in this browser');
      }

      await this.initializeWebSpeech();
      await this.initializeMicrophone();
      
      this.isInitialized = true;
      console.log('Voice input service initialized successfully');
    } catch (error) {
      console.error('Failed to initialize voice input service:', error);
      throw error;
    }
  }

  private isWebSpeechAvailable(): boolean {
    return typeof window !== 'undefined' && (
      'SpeechRecognition' in window || 
      'webkitSpeechRecognition' in window
    );
  }

  private async initializeWebSpeech(): Promise<void> {
    const SpeechRecognition = (window as any).SpeechRecognition || 
                             (window as any).webkitSpeechRecognition;
    
    if (!SpeechRecognition) {
      throw new Error('Web Speech API not supported');
    }

    this.recognition = new SpeechRecognition();
    this.recognition.continuous = this.config.continuous;
    this.recognition.interimResults = this.config.interimResults;
    this.recognition.maxAlternatives = this.config.maxAlternatives;
    this.recognition.lang = this.config.language;

    this.recognition.onresult = (event: any) => {
      const result = event.results[event.results.length - 1];
      const transcription: TranscriptionResult = {
        text: result[0].transcript,
        confidence: result[0].confidence || 1,
        isFinal: result.isFinal,
        alternatives: Array.from(result).map((alt: any) => ({
          text: alt.transcript,
          confidence: alt.confidence || 0
        })),
        timestamp: Date.now()
      };
      
      this.emit('transcription', transcription);
      
      // Reset silence timer on speech
      this.resetSilenceTimer();
    };

    this.recognition.onerror = (event: any) => {
      console.error('Speech recognition error:', event.error);
      this.lastError = event.error;
      
      // Handle different error types
      switch (event.error) {
        case 'network':
          console.log('Speech recognition network error detected');
          this.handleNetworkError();
          // IMMEDIATE FIX: Stop the error loop
          this.stopListening();
          if (window.voiceIPC) {
            window.voiceIPC.send('vad', { status: 'stt-failed', reason: 'network' });
          }
          this.retryCount = this.maxRetries; // Prevent auto-retry loop
          break;
        case 'not-allowed':
          this.emit('error', 'Microphone access denied');
          break;
        case 'no-speech':
          // Don't treat no-speech as a critical error, just continue
          console.log('No speech detected, continuing...');
          break;
        case 'aborted':
          // User intentionally stopped, don't retry
          this.retryCount = this.maxRetries;
          break;
        default:
          this.emit('error', `Speech recognition error: ${event.error}`);
      }
    };

    this.recognition.onend = () => {
      console.log('Speech recognition ended');
      
      if (this.isListening && this.config.continuous && this.retryCount < this.maxRetries) {
        // Auto-restart with retry logic if still supposed to be listening
        const delay = this.lastError === 'network' ? 2000 : 100; // Longer delay for network errors
        
        this.retryTimeout = setTimeout(() => {
          if (this.isListening && this.retryCount < this.maxRetries) {
            try {
              console.log(`Attempting to restart speech recognition (attempt ${this.retryCount + 1}/${this.maxRetries})`);
              this.recognition.start();
              if (this.lastError === 'network') {
                this.retryCount++;
              }
            } catch (error) {
              console.error('Failed to restart speech recognition:', error);
              this.handleRestartFailure();
            }
          }
        }, delay);
      } else {
        this.emit('recording-stopped');
        if (this.retryCount >= this.maxRetries) {
          this.emit('error', 'Maximum retry attempts reached. Please try again manually.');
        }
      }
    };

    this.recognition.onstart = () => {
      console.log('Speech recognition started');
      this.emit('recording-started');
    };
  }

  private async initializeMicrophone(): Promise<void> {
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

      // Set up audio analysis for volume detection
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const source = this.audioContext.createMediaStreamSource(this.mediaStream);
      this.analyser = this.audioContext.createAnalyser();
      
      this.analyser.fftSize = 256;
      source.connect(this.analyser);

      console.log('Microphone access granted');
    } catch (error: any) {
      console.error('Failed to access microphone:', error);
      throw new Error(`Microphone access failed: ${error.message}`);
    }
  }

  async startListening(): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    if (this.isListening) {
      return;
    }

    // Use circuit breaker to prevent cascading failures
    return this.circuitBreaker.execute(
      'voice-recognition',
      async () => {
        // Reset retry counter when manually starting
        this.retryCount = 0;
        this.lastError = null;
        this.clearRetryTimeout();

        // Resume audio context if suspended
        if (this.audioContext && this.audioContext.state === 'suspended') {
          await this.audioContext.resume();
        }

        this.isListening = true;
        
        // Try to start with network check
        if (!this.isNetworkAvailable) {
          await this.checkNetworkAvailability();
        }
        
        this.recognition.start();
        this.startVolumeMonitoring();
        this.resetSilenceTimer();
        
        console.log('Started voice listening');
      },
      async () => {
        // Fallback: Enable offline mode
        console.log('Voice recognition circuit breaker open, enabling offline mode');
        this.offlineModeEnabled = true;
        this.emit('offline-mode-enabled', 'Voice recognition temporarily disabled due to repeated failures');
        throw new Error('Voice recognition is temporarily disabled. Please try again later.');
      }
    ).catch(error => {
      this.isListening = false;
      const voiceError = errorHandler.handleVoiceInputError(error);
      console.error('Failed to start listening:', voiceError);
      const errorMessage = voiceError instanceof Error ? voiceError.message : String(voiceError);
      this.emit('error', errorMessage);
      throw voiceError;
    });
  }

  async stopListening(): Promise<void> {
    if (!this.isListening) {
      return;
    }

    try {
      this.isListening = false;
      this.retryCount = this.maxRetries; // Prevent auto-restart
      this.clearRetryTimeout();
      
      if (this.recognition) {
        this.recognition.stop();
      }
      
      this.stopVolumeMonitoring();
      this.clearSilenceTimer();
      
      console.log('Stopped voice listening');
    } catch (error: any) {
      console.error('Error stopping voice input:', error);
    }
  }

  private startVolumeMonitoring(): void {
    if (!this.analyser) return;

    const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
    
    const checkVolume = () => {
      if (!this.isListening || !this.analyser) return;
      
      this.analyser.getByteFrequencyData(dataArray);
      
      // Calculate volume level (0-1)
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        sum += dataArray[i];
      }
      const volume = sum / (dataArray.length * 255);
      
      // Emit volume level for UI visualization
      if (this.volumeCallback) {
        this.volumeCallback(volume);
      }
      this.emit('volume-level', volume);
      
      // Continue monitoring
      if (this.isListening) {
        requestAnimationFrame(checkVolume);
      }
    };
    
    checkVolume();
  }

  private stopVolumeMonitoring(): void {
    // Volume monitoring stops when this.isListening becomes false
  }

  private resetSilenceTimer(): void {
    this.clearSilenceTimer();
    
    if (this.config.silenceDuration && this.config.silenceDuration > 0) {
      this.silenceTimeout = setTimeout(() => {
        if (this.isListening) {
          console.log('Silence detected - stopping listening');
          this.stopListening();
        }
      }, this.config.silenceDuration);
    }
  }

  private clearSilenceTimer(): void {
    if (this.silenceTimeout) {
      clearTimeout(this.silenceTimeout);
      this.silenceTimeout = null;
    }
  }

  private clearRetryTimeout(): void {
    if (this.retryTimeout) {
      clearTimeout(this.retryTimeout);
      this.retryTimeout = null;
    }
  }

  private handleNetworkError(): void {
    console.warn('Speech recognition network error detected');
    this.emit('network-error', {
      message: 'Network connectivity required for speech recognition',
      canRetry: true,
      fallbackAvailable: false
    });
  }

  private handleRestartFailure(): void {
    console.error('Failed to restart speech recognition');
    this.isListening = false;
    this.emit('error', 'Unable to restart speech recognition. Please try again manually.');
  }

  private async checkNetworkAvailability(): Promise<void> {
    try {
      // Use navigator.onLine as primary check
      if (!navigator.onLine) {
        throw new Error('Browser reports offline status');
      }

      // Try a lightweight connectivity test to Google's speech API
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);
      
      try {
        const response = await fetch('https://speech.googleapis.com/v1/speech:recognize', {
          method: 'POST',
          mode: 'cors',
          signal: controller.signal,
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({}) // This will fail with 401/400, but shows connectivity
        });
        clearTimeout(timeoutId);
        // Any response (including error responses) indicates connectivity
        this.isNetworkAvailable = true;
        console.log('Network connectivity confirmed');
      } catch (fetchError: any) {
        clearTimeout(timeoutId);
        if (fetchError.name === 'AbortError') {
          throw new Error('Network connectivity test timed out');
        }
        // If we get a network error (not HTTP error), we're offline
        if (fetchError.message?.includes('Failed to fetch') || fetchError.message?.includes('NetworkError')) {
          throw new Error('Network connectivity test failed');
        }
        // HTTP errors (401, 400, etc.) actually indicate we have connectivity
        this.isNetworkAvailable = true;
        console.log('Network connectivity confirmed (HTTP error response received)');
      }
    } catch (error) {
      console.warn('Network connectivity check failed:', error);
      this.isNetworkAvailable = false;
      throw new Error('Network connectivity required for speech recognition');
    }
  }

  // Get current error state
  getLastError(): string | null {
    return this.lastError;
  }

  // Get retry information
  getRetryInfo(): { current: number; max: number; canRetry: boolean } {
    return {
      current: this.retryCount,
      max: this.maxRetries,
      canRetry: this.retryCount < this.maxRetries
    };
  }

  // Manual retry method
  async retryListening(): Promise<void> {
    if (this.retryCount >= this.maxRetries) {
      this.retryCount = 0; // Reset for manual retry
    }
    await this.startListening();
  }

  setVolumeCallback(callback: (level: number) => void): void {
    this.volumeCallback = callback;
  }

  setLanguage(language: string): void {
    this.config.language = language;
    if (this.recognition) {
      this.recognition.lang = language;
    }
  }

  isCurrentlyListening(): boolean {
    return this.isListening;
  }

  getConfig(): VoiceInputConfig {
    return { ...this.config };
  }

  // Offline mode and circuit breaker methods
  isOfflineModeEnabled(): boolean {
    return this.offlineModeEnabled;
  }

  getCircuitBreakerStatus(): any {
    return this.circuitBreaker.getCircuitStatus('voice-recognition');
  }

  resetCircuitBreaker(): void {
    this.circuitBreaker.reset('voice-recognition');
    this.offlineModeEnabled = false;
    console.log('Voice recognition circuit breaker manually reset');
    this.emit('circuit-breaker-reset', 'Voice recognition is now available');
  }

  // Enhanced network status
  getNetworkStatus(): {
    isOnline: boolean;
    isNetworkAvailable: boolean;
    offlineModeEnabled: boolean;
    circuitBreakerStatus: any;
  } {
    return {
      isOnline: navigator.onLine,
      isNetworkAvailable: this.isNetworkAvailable,
      offlineModeEnabled: this.offlineModeEnabled,
      circuitBreakerStatus: this.getCircuitBreakerStatus()
    };
  }

  // Event emitter functionality
  private eventListeners: Map<string, Array<(...args: any[]) => void>> = new Map();

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
          console.error(`Error in event listener for ${event}:`, error);
        }
      });
    }
  }

  // Cleanup
  destroy(): void {
    this.stopListening();
    
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
      this.mediaStream = null;
    }
    
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
    
    this.recognition = null;
    this.analyser = null;
    this.eventListeners.clear();
    this.clearSilenceTimer();
    this.clearRetryTimeout();
    
    console.log('Voice input service destroyed');
  }
}

// Singleton instance
let voiceInputService: VoiceInputService | null = null;

export function getVoiceInputService(): VoiceInputService {
  if (!voiceInputService) {
    voiceInputService = new VoiceInputService();
  }
  return voiceInputService;
}

export function destroyVoiceInputService(): void {
  if (voiceInputService) {
    voiceInputService.destroy();
    voiceInputService = null;
  }
}