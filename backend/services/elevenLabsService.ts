
import axios, { AxiosError } from 'axios';
import { AbortController } from 'abort-controller';
import { PhraseCache, AudioBuf } from '../../agent/voice/cache';
import { Voices, VoiceName } from '../../agent/voice/voices';

// Configuration from environment variables
const API_KEY = process.env.ELEVEN_API_KEY;
const DEFAULT_VOICE_ID = process.env.ELEVEN_DEFAULT_VOICE_ID || Voices.Nova;
const MODEL_ID = process.env.ELEVEN_MODEL_ID || 'eleven_monolingual_v1';
const MAX_CHARS_PER_REQUEST = 4500;

// Circuit Breaker states
enum CircuitBreakerState {
  CLOSED,
  OPEN,
  HALF_OPEN,
}

export class ElevenLabsService {
  private playing?: Promise<void>;
  private abort?: AbortController;
  private cache = new PhraseCache();
  private currentVoiceId: string = DEFAULT_VOICE_ID;

  // Circuit Breaker settings
  private circuitBreakerState: CircuitBreakerState = CircuitBreakerState.CLOSED;
  private failures = 0;
  private readonly failureThreshold = 3;
  private readonly resetTimeout = 30000; // 30 seconds

  constructor() {
    if (!API_KEY) {
      const errorMessage = `Eleven Labs API key is not configured. Please set the ELEVEN_API_KEY environment variable.`;
      console.error(errorMessage);
      throw new Error(errorMessage);
    }
  }

  /** Switch voice on the fly */
  switchVoice(name: VoiceName, { interrupt = false } = {}) {
    const id = Voices[name];
    if (!id) throw new Error(`Unknown voice: ${name}`);
    this.currentVoiceId = id;
    if (interrupt && this.abort) {
      this.abort.abort();
    }
  }

  /** Get current voice ID */
  getCurrentVoiceId(): string {
    return this.currentVoiceId;
  }

  /** Play text with caching support */
  async playText(text: string): Promise<void> {
    const cached = this.cache.get(text);
    if (cached) {
      console.log('🎯 Cache hit - instant playback');
      return this.pipeBufferToSpeaker(cached);
    }

    const pcmBuffer = await this.fetchAndDecode(text);
    this.cache.set(text, pcmBuffer);
    return this.pipeBufferToSpeaker(pcmBuffer);
  }

  /** Speak text, optionally interrupting current playback */
  async say(text: string, { interrupt = true } = {}) {
    if (!text.trim()) return;

    if (interrupt && this.abort) {
      this.abort.abort();
      await this.playing?.catch(() => {});
    }

    const chunks = this.chunkText(text);
    for (const chunk of chunks) {
      if (this.abort?.signal.aborted) break;
      this.abort = new AbortController();
      const { signal } = this.abort;

      this.playing = this.streamToSpeaker(chunk, signal);
      try {
        await this.playing;
      } catch (err) {
        if (signal.aborted) return;
        console.error('ElevenLabsService error:', err);
      }
    }
  }

  /** Fetch audio stream for a given text */
  async fetchAudioStream(text: string, voiceId?: string, options?: { stability?: number; similarityBoost?: number }): Promise<any> {
    return this.executeApiRequest(async () => {
      const response = await axios.post(
        `https://api.elevenlabs.io/v1/text-to-speech/${voiceId || this.currentVoiceId}/stream`,
        {
          text,
          model_id: MODEL_ID,
          voice_settings: {
            stability: options?.stability ?? 0.75,
            similarity_boost: options?.similarityBoost ?? 0.75,
          },
        },
        {
          headers: {
            'xi-api-key': API_KEY,
            'Accept': 'audio/mpeg',
            'Content-Type': 'application/json',
          },
          responseType: 'stream',
          timeout: 30000,
        }
      );
      return response.data;
    });
  }

  /** Graceful shutdown */
  async destroy() {
    if (this.abort) this.abort.abort();
    await this.playing?.catch(() => {});
  }

  private async fetchAndDecode(text: string): Promise<AudioBuf> {
    return this.executeApiRequest(async () => {
      const response = await axios.post(
        `https://api.elevenlabs.io/v1/text-to-speech/${this.currentVoiceId}`,
        {
          text,
          model_id: MODEL_ID,
        },
        {
          headers: {
            'xi-api-key': API_KEY,
            'Accept': 'audio/mpeg',
            'Content-Type': 'application/json',
          },
          responseType: 'arraybuffer',
          timeout: 30000,
        }
      );
      return Buffer.from(response.data);
    });
  }

  private async streamToSpeaker(text: string, signal: any) {
    return this.executeApiRequest(async () => {
      const startTime = Date.now();
      const response = await axios.post(
        `https://api.elevenlabs.io/v1/text-to-speech/${this.currentVoiceId}/stream`,
        {
          text,
          model_id: MODEL_ID,
        },
        {
          headers: {
            'xi-api-key': API_KEY,
            'Accept': 'audio/mpeg',
            'Content-Type': 'application/json',
          },
          responseType: 'arraybuffer',
          timeout: 30000,
          signal: signal,
        }
      );

      const audioData = response.data;
      const duration = Date.now() - startTime;
      console.log(`🎯 Voice metrics: Total ${duration}ms, ${audioData.byteLength} bytes`);

      // In a real implementation, this would be sent to renderer via IPC
      const estimatedDuration = audioData.byteLength / (128 * 1000 / 8);
      await new Promise(resolve => setTimeout(resolve, estimatedDuration * 1000));
    });
  }

  private async pipeBufferToSpeaker(buffer: AudioBuf): Promise<void> {
    // Simulate playing cached audio buffer
    // In a real implementation, this would send the buffer to the audio output
    const estimatedDuration = buffer.byteLength / (128 * 1000 / 8);
    console.log(`🔊 Playing cached audio: ${buffer.byteLength} bytes, ~${estimatedDuration.toFixed(1)}s`);
    await new Promise(resolve => setTimeout(resolve, estimatedDuration * 1000));
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

  private async executeApiRequest<T>(requestFn: () => Promise<T>): Promise<T> {
    if (this.circuitBreakerState === CircuitBreakerState.OPEN) {
      throw new Error('Circuit breaker is open. Skipping API request.');
    }

    let retries = 0;
    const maxRetries = 3;

    while (true) {
      try {
        const result = await requestFn();
        this.handleSuccess();
        return result;
      } catch (error) {
        if (axios.isCancel(error)) {
          throw error;
        }
        this.handleFailure();
        if (retries >= maxRetries || !this.isRetryableError(error as AxiosError)) {
          throw error;
        }
        retries++;
        const delay = this.getRetryDelay(retries);
        console.log(`Retrying API request in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  private isRetryableError(error: AxiosError): boolean {
    if (error.response) {
      return error.response.status >= 500;
    }
    return ['ECONNRESET', 'ETIMEDOUT'].includes(error.code || '');
  }

  private getRetryDelay(retryCount: number): number {
    const baseDelay = 200;
    const exponentialDelay = baseDelay * Math.pow(2, retryCount);
    const jitter = Math.random() * 100;
    return exponentialDelay + jitter;
  }

  private handleSuccess() {
    this.failures = 0;
    if (this.circuitBreakerState === CircuitBreakerState.HALF_OPEN) {
      this.circuitBreakerState = CircuitBreakerState.CLOSED;
      console.log('Circuit breaker is now closed.');
    }
  }

  private handleFailure() {
    this.failures++;
    if (this.failures >= this.failureThreshold) {
      this.circuitBreakerState = CircuitBreakerState.OPEN;
      console.error('Circuit breaker is now open.');
      setTimeout(() => {
        this.circuitBreakerState = CircuitBreakerState.HALF_OPEN;
        console.log('Circuit breaker is now half-open.');
      }, this.resetTimeout);
    }
  }
}
