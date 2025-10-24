import { VoiceName } from "./voices";
export declare class VoiceEngine {
  private playing?;
  private abort?;
  private retryCount;
  private maxRetries;
  private cache;
  /** Switch voice on the fly */
  switchVoice(
    name: VoiceName,
    {
      interrupt,
    }?: {
      interrupt?: boolean | undefined;
    },
  ): void;
  /** Get current voice ID */
  getCurrentVoiceId(): string;
  /** Play text with caching support */
  playText(text: string): Promise<void>;
  /** Speak text, optionally interrupting current playback */
  say(
    text: string,
    {
      interrupt,
    }?: {
      interrupt?: boolean | undefined;
    },
  ): Promise<void>;
  /** Graceful shutdown (e.g., on app exit) */
  destroy(): Promise<void>;
  /** Fetch and decode audio from ElevenLabs to audio buffer */
  private fetchAndDecode;
  /** Play PCM buffer using Web Audio API or IPC to renderer */
  private pipeBufferToSpeaker;
  private streamToSpeaker;
  private chunkText;
  private isRetryableError;
}
