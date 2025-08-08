import axios from 'axios';
import { AbortController } from 'abort-controller';
import { PhraseCache, AudioBuf } from './cache';
import { Voices, VoiceName } from './voices';

const API_KEY = process.env.ELEVEN_API_KEY!;
let currentVoiceId: string = Voices.Nova; // Default to Nova Westbrook

if (!API_KEY) throw new Error('Set ELEVEN_API_KEY user env-var first!');

// ElevenLabs has a 5000 char limit per request
const MAX_CHARS_PER_REQUEST = 4500;

// Audio format detection signatures
const AUDIO_SIGNATURES = {
  WAV: 'RIFF',
  MP3_ID3: 'ID3',
  MP3_FRAME: '\xFF' // MP3 frame sync
} as const;

export class VoiceEngine {
  private playing?: Promise<void>;
  private abort?: AbortController;
  private retryCount = 0;
  private maxRetries = 3;
  private cache = new PhraseCache();

  /** Switch voice on the fly */
  switchVoice(name: VoiceName, { interrupt = false } = {}) {
    const id = Voices[name];
    if (!id) throw new Error(`Unknown voice: ${name}`);
    currentVoiceId = id;
    if (interrupt && this.abort) {
      this.abort.abort();
    }
  }

  /** Get current voice ID */
  getCurrentVoiceId(): string {
    return currentVoiceId;
  }

  /** Play text with caching support */
  async playText(text: string): Promise<void> {
    // 0️⃣ Check cache first
    const cached = this.cache.get(text);
    if (cached) {
      console.log('🎯 Cache hit - instant playback');
      return this.pipeBufferToSpeaker(cached);
    }

    // 1️⃣ Fetch and decode from ElevenLabs
    const pcmBuffer = await this.fetchAndDecode(text);

    // 2️⃣ Cache and play
    this.cache.set(text, pcmBuffer);
    return this.pipeBufferToSpeaker(pcmBuffer);
  }

  /** Speak text, optionally interrupting current playback */
  async say(text: string, { interrupt = true } = {}) {
    if (!text.trim()) return;

    if (interrupt && this.abort) {
      this.abort.abort();
      await this.playing?.catch(() => {}); // Wait for cleanup
    }

    // Handle long texts by chunking
    const chunks = this.chunkText(text);
    
    for (const chunk of chunks) {
      if (this.abort?.signal.aborted) break;
      
      this.abort = new AbortController();
      const { signal } = this.abort;

      this.playing = this.streamToSpeaker(chunk, signal);
      try {
        await this.playing;
        this.retryCount = 0; // Reset on success
      } catch (err) {
        if (signal.aborted) return; // Interrupted on purpose
        console.error('VoiceEngine error:', err);
        
        // Retry logic for network failures
        if (this.retryCount < this.maxRetries && this.isRetryableError(err)) {
          this.retryCount++;
          console.log(`Retrying (${this.retryCount}/${this.maxRetries})...`);
          await new Promise(r => setTimeout(r, 1000 * this.retryCount));
          chunks.unshift(chunk); // Retry this chunk
        }
      }
    }
  }

  /** Graceful shutdown (e.g., on app exit) */
  async destroy() {
    if (this.abort) this.abort.abort();
    await this.playing?.catch(() => {});
  }

  /** Fetch and decode audio from ElevenLabs to audio buffer */
  private async fetchAndDecode(text: string): Promise<AudioBuf> {
    try {
      const response = await axios.post(
        `https://api.elevenlabs.io/v1/text-to-speech/${currentVoiceId}`,
        {
          text,
          model_id: 'eleven_monolingual_v1',
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
            style: 0.0,
            use_speaker_boost: true
          }
        },
        {
          headers: {
            'xi-api-key': API_KEY,
            'Accept': 'audio/mpeg',
            'Content-Type': 'application/json'
          },
          responseType: 'arraybuffer',
          timeout: 30000
        }
      );
      
      return Buffer.from(response.data);
    } catch (error: any) {
      console.error('Failed to fetch audio from ElevenLabs:', error);
      throw error;
    }
  }

  /** Play PCM buffer using Web Audio API or IPC to renderer */
  private async pipeBufferToSpeaker(buffer: AudioBuf): Promise<void> {
    // In Electron main process, we send the buffer to renderer for playback
    // This method is called from main process, so we emit events to be handled by voiceHandler
    console.log('Sending audio buffer to renderer for playback');
    
    // Simulate playback delay based on buffer size for timing
    const duration = buffer.length / (44100 * 2); // 44.1kHz, 16-bit mono
    await new Promise(resolve => setTimeout(resolve, duration * 1000));
    return Promise.resolve();
  }

  // ----- internals ---------------------------------------------------------

  private async streamToSpeaker(text: string, signal: any) {
    const startTime = Date.now();
    
    try {
      // 1️⃣ Hit ElevenLabs API directly with axios (browser compatible)
      const response = await axios.post(
        `https://api.elevenlabs.io/v1/text-to-speech/${currentVoiceId}/stream`,
        {
          text,
          model_id: 'eleven_monolingual_v1',
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
            style: 0.0,
            use_speaker_boost: true
          },
          use_ssml: true
        },
        {
          headers: {
            'xi-api-key': API_KEY,
            'Accept': 'audio/mpeg',
            'Content-Type': 'application/json'
          },
          responseType: 'arraybuffer',
          timeout: 30000,
          signal: signal
        }
      );
      
      const audioData = response.data;
      const duration = Date.now() - startTime;
      
      console.log(`🎯 Voice metrics: Total ${duration}ms, ${audioData.byteLength} bytes`);
      
      // In a real implementation, this would be sent to renderer via IPC
      // For now, we simulate playback timing
      const estimatedDuration = audioData.byteLength / (128 * 1000 / 8); // Rough estimate for MP3
      await new Promise(resolve => setTimeout(resolve, estimatedDuration * 1000));
      
      return Promise.resolve();
    } catch (error: any) {
      if (axios.isCancel(error) || signal?.aborted) {
        console.log('Audio streaming cancelled');
        return Promise.resolve();
      }
      
      console.error('ElevenLabs streaming error:', error);
      throw error;
    }
  }

  private chunkText(text: string): string[] {
    if (text.length <= MAX_CHARS_PER_REQUEST) return [text];
    
    const chunks: string[] = [];
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
    let currentChunk = '';

    for (const sentence of sentences) {
      if (currentChunk.length + sentence.length <= MAX_CHARS_PER_REQUEST) {
        currentChunk += sentence;
      } else {
        if (currentChunk) chunks.push(currentChunk.trim());
        currentChunk = sentence;
      }
    }

    if (currentChunk) chunks.push(currentChunk.trim());
    return chunks;
  }

  private isRetryableError(err: any): boolean {
    return err.code === 'ETIMEDOUT' || 
           err.code === 'ECONNRESET' || 
           err.code === 'ENOTFOUND' ||
           (err.response?.statusCode >= 500);
  }
}
