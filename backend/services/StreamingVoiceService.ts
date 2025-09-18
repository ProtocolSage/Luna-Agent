import { EventEmitter } from 'events';
import WebSocket from 'ws';
import { Transform } from 'stream';

/**
 * Real-time Streaming Voice Service
 * Handles bidirectional real-time voice communication with OpenAI Real-time API
 * Features:
 * - Real-time STT streaming (as you speak)
 * - Real-time TTS streaming (sentence-by-sentence AI responses) 
 * - Interrupt/barge-in capability
 * - Echo cancellation
 * - Voice Activity Detection (VAD)
 * - Continuous conversation mode
 */

interface VoiceConfig {
  inputSampleRate: number;
  outputSampleRate: number;
  bufferSize: number;
  vadThreshold: number;
  silenceTimeout: number;
  interruptThreshold: number;
}

interface ConversationState {
  isListening: boolean;
  isSpeaking: boolean;
  canInterrupt: boolean;
  lastUserSpeechTime: number;
  lastAISpeechTime: number;
  conversationActive: boolean;
}

export class StreamingVoiceService extends EventEmitter {
  private ws: WebSocket | null = null;
  private audioContext: any = null;
  private mediaStream: MediaStream | null = null;
  private audioWorklet: AudioWorkletNode | null = null;
  
  // Configuration
  private config: VoiceConfig = {
    inputSampleRate: 24000,  // OpenAI Real-time API requirement
    outputSampleRate: 24000,
    bufferSize: 4096,
    vadThreshold: 0.01,      // Voice activity detection threshold
    silenceTimeout: 1500,    // ms of silence before considering user done
    interruptThreshold: 200  // ms user speech needed to interrupt AI
  };
  
  // State management
  private state: ConversationState = {
    isListening: false,
    isSpeaking: false,
    canInterrupt: false,
    lastUserSpeechTime: 0,
    lastAISpeechTime: 0,
    conversationActive: false
  };
  
  // Audio processing
  private audioBuffer: Float32Array[] = [];
  private vadDetector: VADDetector;
  private echoSuppressor: EchoSuppressor;
  private interruptHandler: InterruptHandler;
  
  // OpenAI Real-time API
  private openaiApiKey: string | null;
  private sessionId: string | null = null;
  private isConnected: boolean = false;
  
  constructor(apiKey?: string) {
    super();
    this.openaiApiKey = apiKey || process.env.OPENAI_API_KEY || null;
    this.vadDetector = new VADDetector(this.config.vadThreshold);
    this.echoSuppressor = new EchoSuppressor();
    this.interruptHandler = new InterruptHandler(this.config.interruptThreshold);
    
    this.setupEventHandlers();
    console.log('[StreamingVoice] Service initialized');
  }
  
  /**
   * Initialize real-time voice communication
   */
  public async initialize(): Promise<void> {
    if (!this.openaiApiKey) {
      throw new Error('OpenAI API key required for real-time voice');
    }
    
    try {
      console.log('[StreamingVoice] Initializing real-time voice service...');
      
      // Initialize audio context
      await this.initializeAudio();
      
      // Connect to OpenAI Real-time API
      await this.connectToOpenAI();
      
      // Start continuous conversation mode
      await this.startContinuousMode();
      
      console.log('[StreamingVoice] Real-time voice service ready');
      this.emit('initialized');
      
    } catch (error) {
      console.error('[StreamingVoice] Initialization failed:', error);
      this.emit('error', error);
      throw error;
    }
  }
  
  /**
   * Initialize Web Audio API with real-time processing
   */
  private async initializeAudio(): Promise<void> {
    try {
      // Request microphone access
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: this.config.inputSampleRate,
          channelCount: 1,
          echoCancellation: true,  // Browser-level echo cancellation
          noiseSuppression: true,
          autoGainControl: true
        }
      });
      
      // Create audio context
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({
        sampleRate: this.config.inputSampleRate
      });
      
      // Load audio worklet for real-time processing
      await this.audioContext.audioWorklet.addModule('/audio-worklet-processor.js');
      
      // Create audio worklet node
      this.audioWorklet = new AudioWorkletNode(this.audioContext, 'streaming-processor', {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        processorOptions: {
          bufferSize: this.config.bufferSize,
          sampleRate: this.config.inputSampleRate
        }
      });
      
      // Connect audio pipeline
      const source = this.audioContext.createMediaStreamSource(this.mediaStream);
      source.connect(this.audioWorklet);
      this.audioWorklet.connect(this.audioContext.destination);
      
      // Handle processed audio data
      this.audioWorklet.port.onmessage = (event) => {
        this.processAudioData(event.data);
      };
      
      console.log('[StreamingVoice] Audio system initialized');
      
    } catch (error) {
      console.error('[StreamingVoice] Audio initialization failed:', error);
      throw error;
    }
  }
  
  /**
   * Connect to OpenAI Real-time API
   */
  private async connectToOpenAI(): Promise<void> {
    return new Promise((resolve, reject) => {
      const wsUrl = `wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-10-01`;
      
      this.ws = new WebSocket(wsUrl, {
        headers: {
          'Authorization': `Bearer ${this.openaiApiKey}`,
          'OpenAI-Beta': 'realtime=v1'
        }
      });
      
      this.ws.on('open', () => {
        console.log('[StreamingVoice] Connected to OpenAI Real-time API');
        this.isConnected = true;
        
        // Send session configuration
        this.sendSessionConfig();
        resolve();
      });
      
      this.ws.on('message', (data) => {
        this.handleOpenAIMessage(JSON.parse(data.toString()));
      });
      
      this.ws.on('error', (error) => {
        console.error('[StreamingVoice] WebSocket error:', error);
        this.isConnected = false;
        this.emit('connection-error', error);
        reject(error);
      });
      
      this.ws.on('close', () => {
        console.log('[StreamingVoice] Disconnected from OpenAI');
        this.isConnected = false;
        this.emit('disconnected');
      });
    });
  }
  
  /**
   * Send initial session configuration to OpenAI
   */
  private sendSessionConfig(): void {
    if (!this.ws) return;
    
    const config = {
      type: 'session.update',
      session: {
        modalities: ['text', 'audio'],
        instructions: 'You are Luna, a helpful AI voice assistant. Speak naturally and conversationally. Be concise but engaging.',
        voice: 'alloy',
        input_audio_format: 'pcm16',
        output_audio_format: 'pcm16',
        input_audio_transcription: {
          model: 'whisper-1'
        },
        turn_detection: {
          type: 'server_vad',
          threshold: 0.5,
          prefix_padding_ms: 300,
          silence_duration_ms: 800
        },
        tools: [],
        tool_choice: 'none',
        temperature: 0.8,
        max_response_output_tokens: 4096
      }
    };
    
    this.ws.send(JSON.stringify(config));
    console.log('[StreamingVoice] Session configured');
  }
  
  /**
   * Process real-time audio data
   */
  private processAudioData(audioData: {
    inputBuffer: Float32Array;
    timestamp: number;
    vadLevel: number;
  }): void {
    const { inputBuffer, timestamp, vadLevel } = audioData;
    
    // 1. Voice Activity Detection
    const hasVoice = this.vadDetector.detect(inputBuffer, vadLevel);
    
    // 2. Echo Cancellation (prevent AI voice from triggering STT)
    const cleanAudio = this.echoSuppressor.process(inputBuffer, this.state.isSpeaking);
    
    // 3. Handle interruption detection
    if (this.state.isSpeaking && hasVoice) {
      const shouldInterrupt = this.interruptHandler.shouldInterrupt(cleanAudio, timestamp);
      if (shouldInterrupt) {
        this.handleUserInterrupt();
      }
    }
    
    // 4. Send audio to OpenAI if listening and has voice
    if (this.state.isListening && hasVoice && this.isConnected) {
      this.sendAudioToOpenAI(cleanAudio);
    }
    
    // 5. Update conversation state
    if (hasVoice) {
      this.state.lastUserSpeechTime = timestamp;
      this.emit('user-speaking', { level: vadLevel, timestamp });
    }
  }
  
  /**
   * Send audio data to OpenAI Real-time API
   */
  private sendAudioToOpenAI(audioData: Float32Array): void {
    if (!this.ws || !this.isConnected) return;
    
    // Convert Float32Array to PCM16
    const pcm16Buffer = this.convertToPCM16(audioData);
    
    const message = {
      type: 'input_audio_buffer.append',
      audio: pcm16Buffer.toString('base64')
    };
    
    this.ws.send(JSON.stringify(message));
  }
  
  /**
   * Handle messages from OpenAI Real-time API
   */
  private handleOpenAIMessage(message: any): void {
    switch (message.type) {
      case 'session.created':
        this.sessionId = message.session.id;
        console.log('[StreamingVoice] Session created:', this.sessionId);
        break;
        
      case 'input_audio_buffer.speech_started':
        console.log('[StreamingVoice] OpenAI detected speech start');
        this.emit('speech-detected');
        break;
        
      case 'input_audio_buffer.speech_stopped':
        console.log('[StreamingVoice] OpenAI detected speech end');
        this.emit('speech-ended');
        break;
        
      case 'conversation.item.input_audio_transcription.completed':
        const transcript = message.transcript;
        console.log('[StreamingVoice] Transcription:', transcript);
        this.emit('transcription', transcript);
        break;
        
      case 'response.audio_transcript.delta':
        // Real-time AI response text (for display)
        this.emit('ai-response-text', message.delta);
        break;
        
      case 'response.audio.delta':
        // Real-time AI response audio
        this.playAudioResponse(message.delta);
        break;
        
      case 'response.done':
        console.log('[StreamingVoice] AI response complete');
        this.handleResponseComplete();
        break;
        
      case 'error':
        console.error('[StreamingVoice] OpenAI error:', message.error);
        this.emit('error', message.error);
        break;
        
      default:
        console.log('[StreamingVoice] Unhandled message:', message.type);
    }
  }
  
  /**
   * Play AI audio response in real-time
   */
  private playAudioResponse(audioData: string): void {
    if (!this.audioContext) return;
    
    try {
      this.state.isSpeaking = true;
      
      // Decode base64 PCM16 audio
      const pcmBuffer = Buffer.from(audioData, 'base64');
      const audioBuffer = this.convertPCM16ToFloat32(pcmBuffer);
      
      // Create audio buffer for playback
      const buffer = this.audioContext.createBuffer(1, audioBuffer.length, this.config.outputSampleRate);
      buffer.copyToChannel(audioBuffer, 0);
      
      // Play audio
      const source = this.audioContext.createBufferSource();
      source.buffer = buffer;
      source.connect(this.audioContext.destination);
      source.start();
      
      // Track AI speech timing
      this.state.lastAISpeechTime = Date.now();
      this.emit('ai-speaking', { buffer: audioBuffer });
      
      source.onended = () => {
        // Check if this was the last audio chunk
        setTimeout(() => {
          if (Date.now() - this.state.lastAISpeechTime > 100) {
            this.state.isSpeaking = false;
            this.emit('ai-finished-speaking');
          }
        }, 100);
      };
      
    } catch (error) {
      console.error('[StreamingVoice] Audio playback error:', error);
      this.state.isSpeaking = false;
    }
  }
  
  /**
   * Handle user interruption of AI speech
   */
  private handleUserInterrupt(): void {
    console.log('[StreamingVoice] User interrupted AI');
    
    // Stop AI speech immediately
    this.state.isSpeaking = false;
    
    // Cancel current AI response
    if (this.ws && this.isConnected) {
      this.ws.send(JSON.stringify({
        type: 'response.cancel'
      }));
    }
    
    // Clear audio playback
    if (this.audioContext) {
      // Stop all audio sources (this is tricky in Web Audio, may need better implementation)
      this.audioContext.suspend().then(() => this.audioContext.resume());
    }
    
    this.emit('user-interrupted');
    
    // Resume listening for new user input
    this.state.isListening = true;
  }
  
  /**
   * Handle completion of AI response
   */
  private handleResponseComplete(): void {
    this.state.isSpeaking = false;
    this.emit('response-complete');
    
    // In continuous mode, automatically resume listening
    if (this.state.conversationActive) {
      setTimeout(() => {
        this.startListening();
      }, 500); // Brief pause before resuming
    }
  }
  
  /**
   * Start continuous conversation mode
   */
  public async startContinuousMode(): Promise<void> {
    console.log('[StreamingVoice] Starting continuous conversation mode');
    this.state.conversationActive = true;
    this.state.canInterrupt = true;
    
    // Start listening immediately
    await this.startListening();
    
    this.emit('continuous-mode-started');
  }
  
  /**
   * Stop continuous conversation mode
   */
  public async stopContinuousMode(): Promise<void> {
    console.log('[StreamingVoice] Stopping continuous conversation mode');
    this.state.conversationActive = false;
    this.state.canInterrupt = false;
    
    await this.stopListening();
    
    this.emit('continuous-mode-stopped');
  }
  
  /**
   * Start listening for user input
   */
  public async startListening(): Promise<void> {
    if (this.state.isListening) return;
    
    console.log('[StreamingVoice] Started listening');
    this.state.isListening = true;
    
    // Commit any buffered audio to OpenAI
    if (this.ws && this.isConnected) {
      this.ws.send(JSON.stringify({
        type: 'input_audio_buffer.commit'
      }));
    }
    
    this.emit('listening-started');
  }
  
  /**
   * Stop listening for user input
   */
  public async stopListening(): Promise<void> {
    if (!this.state.isListening) return;
    
    console.log('[StreamingVoice] Stopped listening');
    this.state.isListening = false;
    this.emit('listening-stopped');
  }
  
  /**
   * Get current conversation state
   */
  public getState(): ConversationState {
    return { ...this.state };
  }
  
  /**
   * Get current configuration
   */
  public getConfig(): VoiceConfig {
    return { ...this.config };
  }
  
  /**
   * Update configuration
   */
  public updateConfig(updates: Partial<VoiceConfig>): void {
    this.config = { ...this.config, ...updates };
    
    // Update components with new config
    this.vadDetector.updateThreshold(this.config.vadThreshold);
    this.interruptHandler.updateThreshold(this.config.interruptThreshold);
    
    console.log('[StreamingVoice] Configuration updated');
  }
  
  /**
   * Cleanup and disconnect
   */
  public async cleanup(): Promise<void> {
    console.log('[StreamingVoice] Cleaning up...');
    
    // Stop conversation
    await this.stopContinuousMode();
    
    // Close WebSocket
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    
    // Stop audio streams
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
      this.mediaStream = null;
    }
    
    // Close audio context
    if (this.audioContext && this.audioContext.state !== 'closed') {
      await this.audioContext.close();
      this.audioContext = null;
    }
    
    this.isConnected = false;
    console.log('[StreamingVoice] Cleanup complete');
  }
  
  // Audio conversion utilities
  private convertToPCM16(float32Array: Float32Array): Buffer {
    const buffer = Buffer.allocUnsafe(float32Array.length * 2);
    for (let i = 0; i < float32Array.length; i++) {
      const sample = Math.max(-1, Math.min(1, float32Array[i]));
      buffer.writeInt16LE(sample * 0x7FFF, i * 2);
    }
    return buffer;
  }
  
  private convertPCM16ToFloat32(pcmBuffer: Buffer): Float32Array {
    const float32Array = new Float32Array(pcmBuffer.length / 2);
    for (let i = 0; i < float32Array.length; i++) {
      float32Array[i] = pcmBuffer.readInt16LE(i * 2) / 0x7FFF;
    }
    return float32Array;
  }
  
  // Event handler setup
  private setupEventHandlers(): void {
    // Handle errors gracefully
    this.on('error', (error) => {
      console.error('[StreamingVoice] Error:', error);
    });
    
    // Handle connection issues
    this.on('connection-error', () => {
      // Attempt reconnection after delay
      setTimeout(() => {
        if (!this.isConnected) {
          console.log('[StreamingVoice] Attempting to reconnect...');
          this.connectToOpenAI().catch(console.error);
        }
      }, 5000);
    });
  }
}

// Supporting classes for audio processing

class VADDetector {
  private threshold: number;
  private smoothingFactor: number = 0.1;
  private currentLevel: number = 0;
  
  constructor(threshold: number) {
    this.threshold = threshold;
  }
  
  detect(audioData: Float32Array, vadLevel?: number): boolean {
    if (vadLevel !== undefined) {
      // Use pre-computed VAD level from audio worklet
      this.currentLevel = this.currentLevel * (1 - this.smoothingFactor) + vadLevel * this.smoothingFactor;
    } else {
      // Compute RMS energy
      let sum = 0;
      for (let i = 0; i < audioData.length; i++) {
        sum += audioData[i] * audioData[i];
      }
      const rms = Math.sqrt(sum / audioData.length);
      this.currentLevel = this.currentLevel * (1 - this.smoothingFactor) + rms * this.smoothingFactor;
    }
    
    return this.currentLevel > this.threshold;
  }
  
  updateThreshold(threshold: number): void {
    this.threshold = threshold;
  }
  
  getCurrentLevel(): number {
    return this.currentLevel;
  }
}

class EchoSuppressor {
  private isAISpeaking: boolean = false;
  private suppressionLevel: number = 0.1;
  
  process(audioData: Float32Array, aiSpeaking: boolean): Float32Array {
    this.isAISpeaking = aiSpeaking;
    
    if (this.isAISpeaking) {
      // Apply suppression when AI is speaking
      const suppressed = new Float32Array(audioData.length);
      for (let i = 0; i < audioData.length; i++) {
        suppressed[i] = audioData[i] * this.suppressionLevel;
      }
      return suppressed;
    }
    
    return audioData;
  }
}

class InterruptHandler {
  private threshold: number;
  private minInterruptDuration: number = 200; // ms
  private lastUserSpeechStart: number = 0;
  private consecutiveSpeechFrames: number = 0;
  
  constructor(threshold: number) {
    this.threshold = threshold;
  }
  
  shouldInterrupt(audioData: Float32Array, timestamp: number): boolean {
    // Simple interrupt detection based on sustained user speech
    let hasSignificantSpeech = false;
    
    // Check for speech energy
    let sum = 0;
    for (let i = 0; i < audioData.length; i++) {
      sum += Math.abs(audioData[i]);
    }
    const avgAmplitude = sum / audioData.length;
    
    if (avgAmplitude > this.threshold) {
      if (this.lastUserSpeechStart === 0) {
        this.lastUserSpeechStart = timestamp;
      }
      this.consecutiveSpeechFrames++;
      
      // Check if we've had enough consecutive speech to warrant interruption
      const speechDuration = timestamp - this.lastUserSpeechStart;
      hasSignificantSpeech = speechDuration > this.minInterruptDuration;
    } else {
      this.lastUserSpeechStart = 0;
      this.consecutiveSpeechFrames = 0;
    }
    
    return hasSignificantSpeech;
  }
  
  updateThreshold(threshold: number): void {
    this.threshold = threshold;
  }
}

export default StreamingVoiceService;