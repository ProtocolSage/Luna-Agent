// app/renderer/services/EnhancedVoiceService.ts
// This file ENHANCES your existing VoiceService with robust features

import { VoiceService, getVoiceService } from './VoiceService';
import EventEmitter from 'events';

// Enhanced voice modes
export type EnhancedVoiceMode = 'voice-activity' | 'push-to-talk' | 'continuous' | 'wake-word' | 'hybrid';

export interface EnhancedVoiceConfig {
  // Voice Activity Detection
  vadEnabled: boolean;
  vadThreshold: number;
  silenceThreshold: number;
  silenceTimeout: number;
  noiseGateThreshold: number;
  
  // Push-to-Talk
  pttKey: string;
  pttMouseButton: boolean;
  
  // Audio Processing
  sampleRate: number;
  smoothingTimeConstant: number;
  fftSize: number;
  
  // Visual Feedback
  showAudioLevels: boolean;
  showConfidence: boolean;
  showDebugInfo: boolean;
  
  // Performance
  chunkSize: number;
  maxRecordingDuration: number;
  audioBufferSize: number;
}

export interface AudioMetrics {
  audioLevel: number;
  noiseFloor: number;
  speechDetected: boolean;
  confidence: number;
  snr: number; // Signal-to-noise ratio
}

export interface VoiceDebugInfo {
  mode: EnhancedVoiceMode;
  isListening: boolean;
  isProcessing: boolean;
  isSpeaking: boolean;
  currentProvider: string;
  metrics: AudioMetrics;
  lastError: string | null;
  apiLatency: number;
  recordingDuration: number;
}

/**
 * Enhanced Voice Service that wraps and extends your existing VoiceService
 * Adds robust voice activity detection, push-to-talk, and debug capabilities
 */
export class EnhancedVoiceService extends EventEmitter {
  private baseVoiceService: VoiceService;
  private config: EnhancedVoiceConfig;
  private currentMode: EnhancedVoiceMode = 'voice-activity';
  
  // Audio processing components
  private audioContext: AudioContext | null = null;
  private analyserNode: AnalyserNode | null = null;
  private mediaStreamSource: MediaStreamAudioSourceNode | null = null;
  private processorNode: ScriptProcessorNode | null = null;
  
  // State tracking
  private isEnhancedListening = false;
  private recordingStartTime = 0;
  private lastSpeechTime = 0;
  private noiseFloorHistory: number[] = [];
  private audioMetrics: AudioMetrics = {
    audioLevel: -100,
    noiseFloor: -100,
    speechDetected: false,
    confidence: 0,
    snr: 0
  };
  
  // Timers and intervals
  private silenceTimer: NodeJS.Timeout | null = null;
  private metricsUpdateInterval: NodeJS.Timeout | null = null;
  private vadCheckInterval: NodeJS.Timeout | null = null;
  
  // Push-to-talk state
  private pttPressed = false;
  private pttKeyListener: ((e: KeyboardEvent) => void) | null = null;
  private pttMouseListener: ((e: MouseEvent) => void) | null = null;
  
  constructor(config?: Partial<EnhancedVoiceConfig>) {
    super();
    
    this.config = {
      // VAD settings
      vadEnabled: true,
      vadThreshold: -50,
      silenceThreshold: -60,
      silenceTimeout: 2000,
      noiseGateThreshold: -55,
      
      // PTT settings  
      pttKey: 'Space',
      pttMouseButton: false,
      
      // Audio settings
      sampleRate: 16000,
      smoothingTimeConstant: 0.8,
      fftSize: 2048,
      
      // UI settings
      showAudioLevels: true,
      showConfidence: true,
      showDebugInfo: false,
      
      // Performance
      chunkSize: 4096,
      maxRecordingDuration: 30000,
      audioBufferSize: 8192,
      
      ...config
    };
    
    this.baseVoiceService = getVoiceService();
    this.setupBaseServiceListeners();
    this.setupKeyboardListeners();
  }

  // ================================
  // PUBLIC API
  // ================================

  async initialize(): Promise<void> {
    try {
      // Initialize base service first
      await this.baseVoiceService.initialize();
      
      // Set up enhanced audio processing
      await this.setupEnhancedAudioProcessing();
      
      // Start metrics monitoring
      this.startMetricsMonitoring();
      
      console.log('[EnhancedVoiceService] Initialized successfully');
      this.emit('initialized');
      
    } catch (error: unknown) {
      console.error('[EnhancedVoiceService] Initialization failed:', error);
      this.emit('error', `Enhanced voice service initialization failed: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  setVoiceMode(mode: EnhancedVoiceMode): void {
    console.log(`[EnhancedVoiceService] Switching to mode: ${mode}`);
    
    const previousMode = this.currentMode;
    this.currentMode = mode;
    
    // Stop current listening if active
    if (this.isEnhancedListening) {
      this.stopEnhancedListening();
    }
    
    // Configure mode-specific settings
    switch (mode) {
      case 'voice-activity':
        this.config.vadEnabled = true;
        this.startVADMonitoring();
        break;
        
      case 'push-to-talk':
        this.config.vadEnabled = false;
        this.stopVADMonitoring();
        break;
        
      case 'continuous':
        this.config.vadEnabled = false;
        this.stopVADMonitoring();
        this.startEnhancedListening();
        break;
        
      case 'wake-word':
        this.config.vadEnabled = true;
        // Wake word detection would be implemented here
        break;
        
      case 'hybrid':
        // Use existing Luna hybrid STT with enhanced processing
        this.config.vadEnabled = true;
        this.startVADMonitoring();
        break;
    }
    
    this.emit('mode-changed', { from: previousMode, to: mode });
  }

  async startListening(): Promise<void> {
    if (this.isEnhancedListening) {
      console.log('[EnhancedVoiceService] Already listening');
      return;
    }
    
    try {
      // Start base service listening
      await this.baseVoiceService.startListening();
      
      // Start enhanced monitoring
      await this.startEnhancedListening();
      
    } catch (error: unknown) {
      console.error('[EnhancedVoiceService] Failed to start listening:', error);
      this.emit('error', `Failed to start listening: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  async stopListening(): Promise<void> {
    if (!this.isEnhancedListening) return;
    
    try {
      // Stop enhanced monitoring first
      await this.stopEnhancedListening();
      
      // Stop base service
      await this.baseVoiceService.stopListening();
      
    } catch (error) {
      console.error('[EnhancedVoiceService] Error stopping listening:', error);
    }
  }

  getDebugInfo(): VoiceDebugInfo {
    return {
      mode: this.currentMode,
      isListening: this.isEnhancedListening,
      isProcessing: this.baseVoiceService.isProcessingActive,
      isSpeaking: this.baseVoiceService.isSpeakingActive,
      currentProvider: 'Enhanced + Luna Base',
      metrics: { ...this.audioMetrics },
      lastError: null, // Would track last error
      apiLatency: 0, // Would track from base service
      recordingDuration: this.recordingStartTime ? Date.now() - this.recordingStartTime : 0
    };
  }

  updateConfig(newConfig: Partial<EnhancedVoiceConfig>): void {
    this.config = { ...this.config, ...newConfig };
    
    // Apply config changes immediately
    if (this.analyserNode) {
      this.analyserNode.smoothingTimeConstant = this.config.smoothingTimeConstant;
      this.analyserNode.fftSize = this.config.fftSize;
    }
    
    this.emit('config-updated', this.config);
  }

  // ================================
  // ENHANCED AUDIO PROCESSING
  // ================================

  private async setupEnhancedAudioProcessing(): Promise<void> {
    try {
      // Create or reuse audio context
      if (!this.audioContext) {
        this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({
          sampleRate: this.config.sampleRate
        });
      }
      
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }
      
      console.log('[EnhancedVoiceService] Enhanced audio processing ready');
      
    } catch (error: unknown) {
      throw new Error(`Failed to setup enhanced audio processing: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async startEnhancedListening(): Promise<void> {
    if (this.isEnhancedListening) return;
    
    try {
      // Get microphone stream
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: this.config.sampleRate,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
      
      // Set up audio analysis
      await this.setupAudioAnalysis(stream);
      
      this.isEnhancedListening = true;
      this.recordingStartTime = Date.now();
      
      // Start VAD monitoring if enabled
      if (this.config.vadEnabled) {
        this.startVADMonitoring();
      }
      
      this.emit('enhanced-listening-started');
      console.log('[EnhancedVoiceService] Enhanced listening started');
      
    } catch (error: unknown) {
      throw new Error(`Failed to start enhanced listening: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async stopEnhancedListening(): Promise<void> {
    this.isEnhancedListening = false;
    this.recordingStartTime = 0;
    
    // Stop VAD monitoring
    this.stopVADMonitoring();
    
    // Clean up timers
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }
    
    // Clean up audio nodes
    this.cleanupAudioNodes();
    
    this.emit('enhanced-listening-stopped');
    console.log('[EnhancedVoiceService] Enhanced listening stopped');
  }

  private async setupAudioAnalysis(stream: MediaStream): Promise<void> {
    if (!this.audioContext) return;
    
    try {
      // Create audio nodes
      this.mediaStreamSource = this.audioContext.createMediaStreamSource(stream);
      this.analyserNode = this.audioContext.createAnalyser();
      
      // Configure analyser
      this.analyserNode.fftSize = this.config.fftSize;
      this.analyserNode.smoothingTimeConstant = this.config.smoothingTimeConstant;
      
      // Connect nodes
      this.mediaStreamSource.connect(this.analyserNode);
      
      // Don't connect to destination (no feedback)
      console.log('[EnhancedVoiceService] Audio analysis setup complete');
      
    } catch (error: unknown) {
      throw new Error(`Failed to setup audio analysis: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // ================================
  // VOICE ACTIVITY DETECTION
  // ================================

  private startVADMonitoring(): void {
    if (this.vadCheckInterval) return;
    
    this.vadCheckInterval = setInterval(() => {
      this.processVAD();
    }, 100); // Check every 100ms
    
    console.log('[EnhancedVoiceService] VAD monitoring started');
  }

  private stopVADMonitoring(): void {
    if (this.vadCheckInterval) {
      clearInterval(this.vadCheckInterval);
      this.vadCheckInterval = null;
    }
  }

  private processVAD(): void {
    if (!this.analyserNode || !this.isEnhancedListening) return;
    
    // Get frequency data
    const bufferLength = this.analyserNode.frequencyBinCount;
    const dataArray = new Float32Array(bufferLength);
    this.analyserNode.getFloatFrequencyData(dataArray);
    
    // Calculate audio metrics
    const audioLevel = this.calculateAudioLevel(dataArray);
    const noiseFloor = this.updateNoiseFloor(audioLevel);
    const snr = audioLevel - noiseFloor;
    
    // Update metrics
    this.audioMetrics = {
      audioLevel,
      noiseFloor,
      speechDetected: snr > this.config.vadThreshold - noiseFloor,
      confidence: Math.max(0, Math.min(1, (snr + 60) / 60)), // Rough confidence estimate
      snr
    };
    
    // Voice activity detection logic
    const speechDetected = this.audioMetrics.speechDetected;
    
    if (speechDetected) {
      this.lastSpeechTime = Date.now();
      
      // Cancel silence timer if speech detected
      if (this.silenceTimer) {
        clearTimeout(this.silenceTimer);
        this.silenceTimer = null;
      }
      
      // Start listening if not already (for voice-activity mode)
      if (this.currentMode === 'voice-activity' && !this.baseVoiceService.isListeningActive) {
        this.baseVoiceService.startListening().catch(console.error);
      }
      
    } else if (this.baseVoiceService.isListeningActive && !this.silenceTimer) {
      // Start silence timer
      this.silenceTimer = setTimeout(() => {
        if (this.baseVoiceService.isListeningActive) {
          console.log('[EnhancedVoiceService] Stopping due to silence timeout');
          this.baseVoiceService.stopListening().catch(console.error);
        }
        this.silenceTimer = null;
      }, this.config.silenceTimeout);
    }
    
    // Emit audio metrics for visualizations
    this.emit('audio-metrics', this.audioMetrics);
  }

  private calculateAudioLevel(frequencyData: Float32Array): number {
    let sum = 0;
    for (let i = 0; i < frequencyData.length; i++) {
      sum += frequencyData[i];
    }
    return sum / frequencyData.length;
  }

  private updateNoiseFloor(currentLevel: number): number {
    // Maintain a history of recent audio levels to estimate noise floor
    this.noiseFloorHistory.push(currentLevel);
    
    // Keep only recent history (last 5 seconds at 100ms intervals)
    if (this.noiseFloorHistory.length > 50) {
      this.noiseFloorHistory.shift();
    }
    
    // Noise floor is the 10th percentile of recent levels
    const sortedLevels = [...this.noiseFloorHistory].sort((a, b) => a - b);
    const percentile10Index = Math.floor(sortedLevels.length * 0.1);
    
    return sortedLevels[percentile10Index] || currentLevel;
  }

  // ================================
  // PUSH-TO-TALK IMPLEMENTATION
  // ================================

  private setupKeyboardListeners(): void {
    this.pttKeyListener = (event: KeyboardEvent) => {
      if (this.currentMode !== 'push-to-talk') return;
      
      if (event.code === this.config.pttKey) {
        if (event.type === 'keydown' && !this.pttPressed) {
          this.pttPressed = true;
          this.handlePTTStart();
          event.preventDefault();
        } else if (event.type === 'keyup' && this.pttPressed) {
          this.pttPressed = false;
          this.handlePTTStop();
          event.preventDefault();
        }
      }
    };
    
    document.addEventListener('keydown', this.pttKeyListener);
    document.addEventListener('keyup', this.pttKeyListener);
    
    // Mouse PTT if enabled
    if (this.config.pttMouseButton) {
      this.pttMouseListener = (event: MouseEvent) => {
        if (this.currentMode !== 'push-to-talk') return;
        
        if (event.button === 0) { // Left mouse button
          if (event.type === 'mousedown' && !this.pttPressed) {
            this.pttPressed = true;
            this.handlePTTStart();
          } else if (event.type === 'mouseup' && this.pttPressed) {
            this.pttPressed = false;
            this.handlePTTStop();
          }
        }
      };
      
      document.addEventListener('mousedown', this.pttMouseListener);
      document.addEventListener('mouseup', this.pttMouseListener);
    }
  }

  private handlePTTStart(): void {
    console.log('[EnhancedVoiceService] PTT started');
    this.baseVoiceService.startListening().catch(console.error);
    this.emit('ptt-started');
  }

  private handlePTTStop(): void {
    console.log('[EnhancedVoiceService] PTT stopped');
    this.baseVoiceService.stopListening().catch(console.error);
    this.emit('ptt-stopped');
  }

  // ================================
  // METRICS AND MONITORING
  // ================================

  private startMetricsMonitoring(): void {
    this.metricsUpdateInterval = setInterval(() => {
      // Emit current debug info for monitoring components
      this.emit('debug-info-updated', this.getDebugInfo());
    }, 200); // Update 5 times per second
  }

  // ================================
  // BASE SERVICE INTEGRATION
  // ================================

  private setupBaseServiceListeners(): void {
    // Forward all base service events
    this.baseVoiceService.on('listening_started', () => {
      this.emit('listening_started');
    });
    
    this.baseVoiceService.on('listening_stopped', () => {
      this.emit('listening_stopped');
    });
    
    this.baseVoiceService.on('transcription_received', (text: string) => {
      this.emit('transcription_received', text);
    });
    
    this.baseVoiceService.on('tts_started', () => {
      this.emit('tts_started');
    });
    
    this.baseVoiceService.on('tts_ended', () => {
      this.emit('tts_ended');
    });
    
    this.baseVoiceService.on('error', (error: string) => {
      this.emit('error', error);
    });
    
    this.baseVoiceService.on('voice-input-error', (error: Error) => {
      this.emit('voice-input-error', error);
    });
  }

  // Proxy base service methods
  async speak(text: string, options?: any): Promise<void> {
    return this.baseVoiceService.speak(text, options);
  }

  stopAudio(): void {
    this.baseVoiceService.stopAudio();
  }

  async chatWithTTS(message: string): Promise<string> {
    return this.baseVoiceService.chatWithTTS(message);
  }

  // ================================
  // CLEANUP
  // ================================

  private cleanupAudioNodes(): void {
    try {
      if (this.processorNode) {
        this.processorNode.disconnect();
        this.processorNode = null;
      }
      
      if (this.mediaStreamSource) {
        this.mediaStreamSource.disconnect();
        this.mediaStreamSource = null;
      }
      
      if (this.analyserNode) {
        this.analyserNode.disconnect();
        this.analyserNode = null;
      }
    } catch (error) {
      console.warn('[EnhancedVoiceService] Error cleaning up audio nodes:', error);
    }
  }

  async destroy(): Promise<void> {
    console.log('[EnhancedVoiceService] Destroying...');
    
    // Stop all monitoring
    this.stopVADMonitoring();
    
    if (this.metricsUpdateInterval) {
      clearInterval(this.metricsUpdateInterval);
      this.metricsUpdateInterval = null;
    }
    
    // Stop enhanced listening
    await this.stopEnhancedListening();
    
    // Remove event listeners
    if (this.pttKeyListener) {
      document.removeEventListener('keydown', this.pttKeyListener);
      document.removeEventListener('keyup', this.pttKeyListener);
    }
    
    if (this.pttMouseListener) {
      document.removeEventListener('mousedown', this.pttMouseListener);
      document.removeEventListener('mouseup', this.pttMouseListener);
    }
    
    // Clean up audio context
    if (this.audioContext && this.audioContext.state !== 'closed') {
      await this.audioContext.close();
    }
    
    // Remove all listeners
    this.removeAllListeners();
    
    console.log('[EnhancedVoiceService] Destroyed');
  }
}

// Singleton instance
let enhancedVoiceServiceInstance: EnhancedVoiceService | null = null;

export function getEnhancedVoiceService(): EnhancedVoiceService {
  if (!enhancedVoiceServiceInstance) {
    enhancedVoiceServiceInstance = new EnhancedVoiceService();
  }
  return enhancedVoiceServiceInstance;
}

export async function destroyEnhancedVoiceService(): Promise<void> {
  if (enhancedVoiceServiceInstance) {
    await enhancedVoiceServiceInstance.destroy();
    enhancedVoiceServiceInstance = null;
  }
}
