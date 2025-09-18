import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';

// Type definitions for optional dependencies
interface PorcupineModule {
  Porcupine: any;
}

interface MicModule {
  (config: any): {
    start: () => void;
    stop: () => void;
    getAudioStream: () => NodeJS.ReadableStream;
  };
}

interface OpenAIResponse {
  text: string;
}

export class VoiceInputService extends EventEmitter {
  private porcupine: any = null;
  private isListening: boolean = false;
  private wakeWordActive: boolean = true;
  private continuousMode: boolean = false;
  private vadTimeout: NodeJS.Timeout | null = null;
  private micInstance: any = null;
  private audioStream: any = null;
  private dependenciesLoaded: boolean = false;
  private openaiApiKey: string | null = null;
  
  constructor() {
    super();
    this.initialize();
  }
  
  private async initialize(): Promise<void> {
    console.log('[VoiceInputService] Initializing voice input service...');
    
    try {
      // Load OpenAI API key for Whisper STT
      this.openaiApiKey = process.env.OPENAI_API_KEY || null;
      
      if (!this.openaiApiKey) {
        console.log('[VoiceInputService] No OpenAI API key - using Web Speech API fallback');
      } else {
        console.log('[VoiceInputService] OpenAI Whisper STT available');
      }
      
      // Try to load optional dependencies for wake word and audio capture
      await this.loadDependencies();
      
      // Initialize wake word detection
      await this.initializeWakeWord();
      
      console.log('[VoiceInputService] Voice input service initialized');
      
    } catch (error) {
      console.error('[VoiceInputService] Initialization error:', error);
      this.initializeWebSpeech();
    }
  }
  
  private async loadDependencies(): Promise<void> {
    try {
      // We don't need Azure Speech SDK anymore, just mark as loaded
      this.dependenciesLoaded = true;
      console.log('[VoiceInputService] Dependencies loaded for wake word detection');
    } catch (error) {
      console.error('[VoiceInputService] Failed to load dependencies:', error);
      this.dependenciesLoaded = false;
    }
  }
  
  private async initializeWakeWord(): Promise<void> {
    try {
      const accessKey = process.env.PICOVOICE_ACCESS_KEY;
      if (!accessKey) {
        console.log('[VoiceInputService] Wake word detection disabled - no Picovoice key');
        return;
      }
      
      // Try to load Porcupine Node SDK
      let PorcupineNode: PorcupineModule | null = null;
      try {
        PorcupineNode = await import('@picovoice/porcupine-node') as PorcupineModule;
      } catch (error) {
        console.log('[VoiceInputService] Porcupine Node SDK not available:', error instanceof Error ? error.message : 'Unknown error');
        return;
      }
      
      if (!PorcupineNode) {
        console.log('[VoiceInputService] Failed to load Porcupine Node SDK');
        return;
      }
      
      // Initialize Porcupine with "Hey Luna" wake word
      const keywordPath = path.join(__dirname, '../../assets/hey-luna.ppn');
      
      if (fs.existsSync(keywordPath)) {
        this.porcupine = new PorcupineNode.Porcupine(
          accessKey,
          [keywordPath],
          [0.5] // sensitivity
        );
        
        console.log('[VoiceInputService] Wake word detection initialized');
        await this.startWakeWordDetection();
      } else {
        console.log('[VoiceInputService] Wake word file not found:', keywordPath);
      }
    } catch (error) {
      console.error('[VoiceInputService] Wake word initialization failed:', error);
      this.wakeWordActive = false;
    }
  }
  
  private async startWakeWordDetection(): Promise<void> {
    if (!this.porcupine) return;
    
    try {
      // Try to load mic module
      let mic: MicModule | null = null;
      try {
        const micModule = await import('mic') as any;
        mic = micModule.default || micModule;
      } catch (error) {
        console.log('[VoiceInputService] Mic module not available for wake word detection');
        return;
      }
      
      if (!mic) {
        console.log('[VoiceInputService] Failed to load mic module');
        return;
      }
      
      console.log('[VoiceInputService] Starting wake word detection...');
      
      // Implement wake word detection loop
      const frameLength = this.porcupine.frameLength;
      const sampleRate = this.porcupine.sampleRate;
      
      // Create audio stream for wake word
      this.audioStream = mic({
        rate: String(sampleRate),
        channels: '1',
        debug: false,
        exitOnSilence: 6
      });
      
      const inputStream = this.audioStream.getAudioStream();
      
      inputStream.on('data', (data: Buffer) => {
        if (!this.wakeWordActive || this.isListening) return;
        
        try {
          // Convert buffer to int16 array
          const int16Array = new Int16Array(
            data.buffer,
            data.byteOffset,
            data.length / 2
          );
          
          // Process frame
          if (int16Array.length >= frameLength) {
            const keywordIndex = this.porcupine.process(int16Array);
            
            if (keywordIndex >= 0) {
              console.log('[VoiceInputService] Wake word detected!');
              this.emit('wakeword');
              this.startListening();
            }
          }
        } catch (error) {
          console.error('[VoiceInputService] Wake word processing error:', error);
        }
      });
      
      inputStream.on('error', (error: Error) => {
        console.error('[VoiceInputService] Wake word audio stream error:', error);
      });
      
      this.audioStream.start();
      
    } catch (error) {
      console.error('[VoiceInputService] Failed to start wake word detection:', error);
    }
  }
  
  private initializeWebSpeech(): void {
    console.log('[VoiceInputService] Initialized in fallback mode - using Web Speech API through renderer');
    // Fallback for Web Speech API through IPC
    this.emit('fallback-mode', 'web-speech');
  }
  
  public async startListening(): Promise<void> {
    if (this.isListening) {
      console.log('[VoiceInputService] Already listening');
      return;
    }
    
    console.log('[VoiceInputService] Starting to listen...');
    this.isListening = true;
    this.emit('listening-started');
    
    if (!this.openaiApiKey) {
      // Use Web Speech API fallback
      console.log('[VoiceInputService] Using browser speech recognition fallback');
      this.emit('request-browser-speech');
      return;
    }
    
    try {
      // Start audio capture for OpenAI Whisper STT
      await this.startAudioCapture();
      
    } catch (error) {
      console.error('[VoiceInputService] Failed to start listening:', error);
      this.emit('error', error instanceof Error ? error.message : 'Unknown error');
      this.stopListening();
    }
  }
  
  private async startAudioCapture(): Promise<void> {
    try {
      // Try to load mic module for audio capture
      let mic: MicModule | null = null;
      try {
        const micModule = await import('mic') as any;
        mic = micModule.default || micModule;
      } catch (error) {
        console.log('[VoiceInputService] Mic module not available, using browser fallback');
        this.emit('request-browser-speech');
        return;
      }
      
      if (!mic) {
        console.log('[VoiceInputService] Failed to load mic module, using browser fallback');
        this.emit('request-browser-speech');
        return;
      }
      
      console.log('[VoiceInputService] Starting audio capture for Whisper STT...');
      
      // Configure audio stream
      this.audioStream = mic({
        rate: '16000',
        channels: '1',
        debug: false,
        exitOnSilence: 3,
        fileType: 'wav'
      });
      
      const inputStream = this.audioStream.getAudioStream();
      const audioChunks: Buffer[] = [];
      
      inputStream.on('data', (chunk: Buffer) => {
        audioChunks.push(chunk);
        this.resetVADTimeout();
      });
      
      inputStream.on('silence', async () => {
        console.log('[VoiceInputService] Silence detected, processing audio...');
        
        if (audioChunks.length === 0) {
          console.log('[VoiceInputService] No audio data captured');
          this.emit('no-match');
          return;
        }
        
        // Combine audio chunks
        const audioBuffer = Buffer.concat(audioChunks);
        audioChunks.length = 0; // Clear chunks
        
        try {
          // Send to OpenAI Whisper
          const transcription = await this.transcribeWithWhisper(audioBuffer);
          
          if (transcription && transcription.trim().length > 0) {
            console.log('[VoiceInputService] Whisper result:', transcription);
            this.emit('final-result', transcription);
            
            if (!this.continuousMode) {
              this.stopListening();
            }
          } else {
            console.log('[VoiceInputService] Empty transcription');
            this.emit('no-match');
          }
          
        } catch (error) {
          console.error('[VoiceInputService] Transcription error:', error);
          this.emit('error', error instanceof Error ? error.message : 'Transcription failed');
        }
      });
      
      inputStream.on('error', (error: Error) => {
        console.error('[VoiceInputService] Audio stream error:', error);
        this.emit('error', error.message);
        this.stopListening();
      });
      
      // Start audio capture
      this.audioStream.start();
      
      // Set timeout for maximum listening duration
      this.resetVADTimeout();
      
    } catch (error) {
      console.error('[VoiceInputService] Failed to start audio capture:', error);
      throw error;
    }
  }
  
  private async transcribeWithWhisper(audioBuffer: Buffer): Promise<string> {
    if (!this.openaiApiKey) {
      throw new Error('OpenAI API key not available');
    }
    
    try {
      console.log('[VoiceInputService] Sending audio to OpenAI Whisper...');
      
      const FormData = require('form-data');
      const form = new FormData();
      
      // Add audio file to form data
      form.append('file', audioBuffer, {
        filename: 'audio.wav',
        contentType: 'audio/wav'
      });
      form.append('model', 'whisper-1');
      form.append('language', 'en');
      
      const response = await axios.post<OpenAIResponse>(
        'https://api.openai.com/v1/audio/transcriptions',
        form,
        {
          headers: {
            ...form.getHeaders(),
            'Authorization': `Bearer ${this.openaiApiKey}`,
          },
          timeout: 10000 // 10 second timeout
        }
      );
      
      return response.data.text;
      
    } catch (error) {
      console.error('[VoiceInputService] Whisper transcription failed:', error);
      
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 429) {
          throw new Error('Rate limit exceeded for Whisper API');
        } else if (error.response?.status === 401) {
          throw new Error('Invalid OpenAI API key');
        }
      }
      
      throw new Error('Whisper transcription failed');
    }
  }
  
  public async stopListening(): Promise<void> {
    if (!this.isListening) return;
    
    console.log('[VoiceInputService] Stopping listening...');
    this.isListening = false;
    
    try {
      if (this.audioStream) {
        this.audioStream.stop();
        this.audioStream = null;
      }
      
      if (this.vadTimeout) {
        clearTimeout(this.vadTimeout);
        this.vadTimeout = null;
      }
      
      console.log('[VoiceInputService] Stopped listening');
      this.emit('listening-stopped');
      
    } catch (error) {
      console.error('[VoiceInputService] Error stopping listening:', error);
    }
  }
  
  private resetVADTimeout(): void {
    if (this.vadTimeout) {
      clearTimeout(this.vadTimeout);
    }
    
    // Reset VAD timeout
    this.vadTimeout = setTimeout(() => {
      if (this.isListening && !this.continuousMode) {
        console.log('[VoiceInputService] VAD timeout - stopping listening');
        this.stopListening();
      }
    }, 2000); // 2 second silence timeout
  }
  
  public setContinuousMode(enabled: boolean): void {
    console.log('[VoiceInputService] Continuous mode:', enabled);
    this.continuousMode = enabled;
  }
  
  public setWakeWordEnabled(enabled: boolean): void {
    console.log('[VoiceInputService] Wake word enabled:', enabled);
    this.wakeWordActive = enabled;
  }
  
  public isCurrentlyListening(): boolean {
    return this.isListening;
  }
  
  public getStatus(): {
    isListening: boolean;
    wakeWordActive: boolean;
    continuousMode: boolean;
    dependenciesLoaded: boolean;
    hasOpenAIWhisper: boolean;
    hasPorcupine: boolean;
    provider: string;
  } {
    return {
      isListening: this.isListening,
      wakeWordActive: this.wakeWordActive,
      continuousMode: this.continuousMode,
      dependenciesLoaded: this.dependenciesLoaded,
      hasOpenAIWhisper: !!this.openaiApiKey,
      hasPorcupine: !!this.porcupine,
      provider: this.openaiApiKey ? 'openai-whisper' : 'web-speech-fallback'
    };
  }
  
  public async cleanup(): Promise<void> {
    console.log('[VoiceInputService] Cleaning up...');
    
    try {
      await this.stopListening();
      
      if (this.audioStream) {
        this.audioStream.stop();
        this.audioStream = null;
      }
      
      if (this.porcupine) {
        this.porcupine.release();
        this.porcupine = null;
      }
      
      console.log('[VoiceInputService] Cleanup complete');
    } catch (error) {
      console.error('[VoiceInputService] Cleanup error:', error);
    }
  }
}

// Export singleton instance
export default new VoiceInputService();