// app/renderer/services/api/voiceClient.ts
// Robust TTS/STT client for the renderer. Works with strict CSP and your fetch shim.

import { apiFetch } from '../config';
import { extractText, SttResponse } from '../voiceContracts';
import { API } from '../../config/endpoints';

export type TTSProvider = 'elevenlabs' | 'openai' | undefined;

export interface TTSOptions {
  provider?: TTSProvider;
  voiceId?: string;
  stability?: number;        // 0..1
  similarityBoost?: number;  // 0..1
  streaming?: boolean;       // Enable streaming TTS
}

/**
 * Call backend TTS and return a Blob (audio/mpeg). Throws on HTTP != 2xx.
 */
export async function tts(text: string, opt: TTSOptions = {}): Promise<Blob> {
  if (!text || !text.trim()) throw new Error('tts: text required');

  const endpoint = opt.streaming ? API.TTS_STREAM : API.TTS_SYNTHESIZE;
  
  const r = await apiFetch(endpoint, {
    method: 'POST',
    body: {
      text,
      provider: opt.provider,         // undefined => backend tries ElevenLabs then OpenAI
      voiceId: opt.voiceId,
      stability: opt.stability,
      similarityBoost: opt.similarityBoost
    }
  });

  if (!r.ok) {
    const msg = await safeError(r);
    throw new Error(`TTS ${r.status}: ${msg}`);
  }
  return await r.blob(); // audio/mpeg
}

/**
 * Streaming TTS - returns an async iterator that yields audio chunks as they arrive.
 * Provides lower latency by starting playback before all audio is generated.
 */
export async function* ttsStream(text: string, opt: TTSOptions = {}): AsyncGenerator<Uint8Array, void, unknown> {
  if (!text || !text.trim()) throw new Error('tts: text required');

  const r = await apiFetch(API.TTS_STREAM, {
    method: 'POST',
    body: {
      text,
      provider: 'openai',  // Streaming only supported with OpenAI
      voiceId: opt.voiceId,
    }
  });

  if (!r.ok) {
    const msg = await safeError(r);
    throw new Error(`TTS Stream ${r.status}: ${msg}`);
  }

  const reader = r.body?.getReader();
  if (!reader) {
    throw new Error('Response body not readable');
  }

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      yield value;
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Play streaming TTS with progressive audio playback.
 * Returns a controller with stop() method.
 */
export async function playStreamingTTS(text: string, opt: TTSOptions = {}): Promise<{
  stop: () => void;
  promise: Promise<void>;
}> {
  const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
  const chunks: Uint8Array[] = [];
  let stopped = false;
  let audioSource: AudioBufferSourceNode | null = null;

  const stop = () => {
    stopped = true;
    if (audioSource) {
      try {
        audioSource.stop();
      } catch (e) {
        // Already stopped
      }
    }
    if (audioContext.state !== 'closed') {
      audioContext.close().catch(() => {});
    }
  };

  const promise = (async () => {
    try {
      // Collect all chunks
      for await (const chunk of ttsStream(text, opt)) {
        if (stopped) break;
        chunks.push(chunk);
      }

      if (stopped || chunks.length === 0) return;

      // Concatenate all chunks into a single buffer
      const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
      const audioData = new Uint8Array(totalLength);
      let offset = 0;
      for (const chunk of chunks) {
        audioData.set(chunk, offset);
        offset += chunk.length;
      }

      // Decode the MP3 audio data
      const audioBuffer = await audioContext.decodeAudioData(audioData.buffer);

      if (stopped) return;

      // Play the audio
      audioSource = audioContext.createBufferSource();
      audioSource.buffer = audioBuffer;
      audioSource.connect(audioContext.destination);
      audioSource.start(0);

      // Wait for playback to complete
      await new Promise<void>((resolve) => {
        audioSource!.onended = () => resolve();
      });
    } catch (error) {
      console.error('Streaming TTS playback error:', error);
      throw error;
    } finally {
      if (audioContext.state !== 'closed') {
        audioContext.close().catch(() => {});
      }
    }
  })();

  return { stop, promise };
}

/**
 * Post recorded audio to backend Whisper proxy for transcription.
 * Accepts audio Blob; returns plain text transcription.
 */
export async function transcribe(audio: Blob): Promise<string> {
  if (!audio || !(audio instanceof Blob)) throw new Error('transcribe: Blob required');

  const fd = new FormData();
  fd.append('file', audio, 'audio.webm'); // the route expects "file"

  const r = await apiFetch(API.STT_TRANSCRIBE, { method: 'POST', body: fd });
  if (!r.ok) {
    const msg = await safeError(r);
    throw new Error('Transcribe ' + r.status + ': ' + msg);
  }
  const j = (await r.json()) as SttResponse;
  const text = extractText(j);
  if (!text) {
    throw new Error('transcribe malformed response');
  }
  return text;
}

/** Play an audio Blob (mp3) and return a controller with stop() */
export function playMp3Blob(blob: Blob) {
  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);
  audio.play().catch(() => {/* noop: caller may call stop() and ignore */});

  return {
    element: audio,
    stop: () => {
      try { audio.pause(); } catch {}
      try { URL.revokeObjectURL(url); } catch {}
    }
  };
}

async function safeError(r: Response): Promise<string> {
  try {
    const t = await r.text();
    try { const j = JSON.parse(t); return j?.error || j?.message || t; } catch { return t; }
  } catch { return `${r.statusText}`; }
}

