import { EventEmitter } from 'events';
import OpenAI from 'openai';
import { Readable } from 'stream';

/**
 * WebSocket Streaming STT Service
 * Provides real-time speech-to-text transcription via WebSocket
 * Uses OpenAI Whisper API for transcription
 * 
 * Features:
 * - Real-time audio streaming
 * - Partial and final transcriptions
 * - Buffer management for optimal chunk sizes
 * - Error handling and reconnection support
 * - Multiple audio format support
 */

interface STTConfig {
  model: string;
  language?: string;
  temperature?: number;
  minChunkDuration: number;  // Minimum audio duration before transcription (ms)
  maxChunkDuration: number;  // Maximum audio duration before forced transcription (ms)
  sampleRate: number;
  enablePartialResults: boolean;
}

interface AudioChunk {
  buffer: Buffer;
  timestamp: number;
  format: string;
}

export class WebSocketSTTService extends EventEmitter {
  private openai: OpenAI | null = null;
  private config: STTConfig;
  private audioBuffer: AudioChunk[] = [];
  private bufferStartTime: number = 0;
  private isProcessing: boolean = false;
  private totalDuration: number = 0;
  
  constructor(apiKey?: string) {
    super();
    
    this.openai = apiKey || process.env.OPENAI_API_KEY 
      ? new OpenAI({ apiKey: apiKey || process.env.OPENAI_API_KEY })
      : null;
    
    this.config = {
      model: 'whisper-1',
      language: 'en',
      temperature: 0,
      minChunkDuration: 1000,      // 1 second minimum
      maxChunkDuration: 10000,     // 10 seconds maximum
      sampleRate: 16000,
      enablePartialResults: true
    };
    
    console.log('[WebSocketSTT] Service initialized');
  }
  
  /**
   * Process incoming audio chunk
   */
  public async processAudioChunk(audioData: Buffer, format: string = 'webm'): Promise<void> {
    if (!this.openai) {
      this.emit('error', 'OpenAI API key not configured');
      return;
    }
    
    try {
      // Add chunk to buffer
      const chunk: AudioChunk = {
        buffer: audioData,
        timestamp: Date.now(),
        format
      };
      
      if (this.audioBuffer.length === 0) {
        this.bufferStartTime = chunk.timestamp;
      }
      
      this.audioBuffer.push(chunk);
      
      const bufferDuration = chunk.timestamp - this.bufferStartTime;
      this.totalDuration += audioData.length / (this.config.sampleRate * 2); // Assuming 16-bit audio
      
      // Check if we should process the buffer
      const shouldProcess = 
        bufferDuration >= this.config.maxChunkDuration ||
        (bufferDuration >= this.config.minChunkDuration && !this.isProcessing);
      
      if (shouldProcess) {
        await this.processBuffer();
      }
      
    } catch (error) {
      console.error('[WebSocketSTT] Error processing audio chunk:', error);
      this.emit('error', error instanceof Error ? error.message : 'Audio processing error');
    }
  }
  
  /**
   * Process accumulated audio buffer
   */
  private async processBuffer(): Promise<void> {
    if (this.isProcessing || this.audioBuffer.length === 0) {
      return;
    }
    
    this.isProcessing = true;
    
    try {
      // Combine all audio chunks into single buffer
      const combinedBuffer = Buffer.concat(this.audioBuffer.map(chunk => chunk.buffer));
      const format = this.audioBuffer[0].format;
      
      // Clear the buffer
      const processedChunks = this.audioBuffer.length;
      this.audioBuffer = [];
      this.bufferStartTime = 0;
      
      // Emit processing status
      this.emit('processing', { 
        chunks: processedChunks,
        size: combinedBuffer.length,
        duration: this.totalDuration
      });
      
      // Create a readable stream from the buffer
      const audioStream = Readable.from(combinedBuffer);
      
      // Determine file extension based on format
      const extension = this.getFileExtension(format);
      const filename = `audio_${Date.now()}.${extension}`;
      
      // Create a File-like object for OpenAI API
      const audioFile = await this.createFileFromBuffer(combinedBuffer, filename);
      
      // Call Whisper API
      const transcription = await this.openai!.audio.transcriptions.create({
        file: audioFile,
        model: this.config.model,
        language: this.config.language,
        temperature: this.config.temperature,
        response_format: 'verbose_json'
      });
      
      // Emit transcription result
      if (transcription.text && transcription.text.trim()) {
        this.emit('transcription', {
          text: transcription.text,
          isFinal: true,
          duration: transcription.duration,
          language: transcription.language,
          timestamp: Date.now()
        });
        
        console.log('[WebSocketSTT] Transcription:', transcription.text);
      } else {
        console.log('[WebSocketSTT] Empty transcription received');
      }
      
    } catch (error: any) {
      console.error('[WebSocketSTT] Transcription error:', error);
      this.emit('error', {
        message: error?.message || 'Transcription failed',
        code: error?.code || 'TRANSCRIPTION_ERROR'
      });
    } finally {
      this.isProcessing = false;
    }
  }
  
  /**
   * Force process any remaining audio in buffer
   */
  public async flush(): Promise<void> {
    if (this.audioBuffer.length > 0) {
      await this.processBuffer();
    }
  }
  
  /**
   * Reset the service state
   */
  public reset(): void {
    this.audioBuffer = [];
    this.bufferStartTime = 0;
    this.isProcessing = false;
    this.totalDuration = 0;
    console.log('[WebSocketSTT] Service reset');
  }
  
  /**
   * Update configuration
   */
  public updateConfig(updates: Partial<STTConfig>): void {
    this.config = { ...this.config, ...updates };
    console.log('[WebSocketSTT] Configuration updated:', updates);
  }
  
  /**
   * Get current configuration
   */
  public getConfig(): STTConfig {
    return { ...this.config };
  }
  
  /**
   * Get current buffer status
   */
  public getBufferStatus(): {
    chunks: number;
    totalBytes: number;
    duration: number;
    isProcessing: boolean;
  } {
    const totalBytes = this.audioBuffer.reduce((sum, chunk) => sum + chunk.buffer.length, 0);
    return {
      chunks: this.audioBuffer.length,
      totalBytes,
      duration: this.totalDuration,
      isProcessing: this.isProcessing
    };
  }
  
  /**
   * Helper: Get file extension for audio format
   */
  private getFileExtension(format: string): string {
    const formatMap: Record<string, string> = {
      'webm': 'webm',
      'wav': 'wav',
      'mp3': 'mp3',
      'mp4': 'mp4',
      'm4a': 'm4a',
      'ogg': 'ogg',
      'opus': 'opus'
    };
    
    return formatMap[format.toLowerCase()] || 'webm';
  }
  
  /**
   * Helper: Create File-like object from Buffer
   */
  private async createFileFromBuffer(buffer: Buffer, filename: string): Promise<File> {
    // Convert Buffer to Uint8Array for File constructor
    const uint8Array = new Uint8Array(buffer);
    return new File([uint8Array], filename);
  }
}

export default WebSocketSTTService;
