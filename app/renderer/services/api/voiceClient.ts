// app/renderer/services/api/voiceClient.ts
// Robust TTS/STT client for the renderer. Works with strict CSP and your fetch shim.

import { apiFetch } from "../config";
import { extractText, SttResponse } from "../voiceContracts";
import { API } from "../../config/endpoints";

export type TTSProvider = "elevenlabs" | "openai" | undefined;

export interface TTSOptions {
  provider?: TTSProvider;
  voiceId?: string;
  stability?: number; // 0..1
  similarityBoost?: number; // 0..1
}

/**
 * Call backend TTS and return a Blob (audio/mpeg). Throws on HTTP != 2xx.
 */
export async function tts(text: string, opt: TTSOptions = {}): Promise<Blob> {
  if (!text || !text.trim()) throw new Error("tts: text required");

  const r = await apiFetch(API.TTS_SYNTHESIZE, {
    method: "POST",
    body: {
      text,
      provider: opt.provider, // undefined => backend tries ElevenLabs then OpenAI
      voiceId: opt.voiceId,
      stability: opt.stability,
      similarityBoost: opt.similarityBoost,
    },
  });

  if (!r.ok) {
    const msg = await safeError(r);
    throw new Error(`TTS ${r.status}: ${msg}`);
  }
  return await r.blob(); // audio/mpeg
}

/**
 * Post recorded audio to backend Whisper proxy for transcription.
 * Accepts audio Blob; returns plain text transcription.
 */
export async function transcribe(audio: Blob): Promise<string> {
  if (!audio || !(audio instanceof Blob))
    throw new Error("transcribe: Blob required");

  const fd = new FormData();
  fd.append("file", audio, "audio.webm"); // the route expects "file"

  const r = await apiFetch(API.STT_TRANSCRIBE, { method: "POST", body: fd });
  if (!r.ok) {
    const msg = await safeError(r);
    throw new Error("Transcribe " + r.status + ": " + msg);
  }
  const j = (await r.json()) as SttResponse;
  const text = extractText(j);
  if (!text) {
    throw new Error("transcribe malformed response");
  }
  return text;
}

/** Play an audio Blob (mp3) and return a controller with stop() */
export function playMp3Blob(blob: Blob) {
  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);
  audio.play().catch(() => {
    /* noop: caller may call stop() and ignore */
  });

  return {
    element: audio,
    stop: () => {
      try {
        audio.pause();
      } catch {}
      try {
        URL.revokeObjectURL(url);
      } catch {}
    },
  };
}

async function safeError(r: Response): Promise<string> {
  try {
    const t = await r.text();
    try {
      const j = JSON.parse(t);
      return j?.error || j?.message || t;
    } catch {
      return t;
    }
  } catch {
    return `${r.statusText}`;
  }
}
