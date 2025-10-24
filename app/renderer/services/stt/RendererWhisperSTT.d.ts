import { EventEmitter } from "events";
import { STTProvider, STTConfig } from "./STTInterface";
export interface TranscriptResult {
  text: string;
  isFinal: boolean;
  confidence?: number;
}
export declare class RendererWhisperSTT
  extends EventEmitter
  implements STTProvider
{
  readonly name: string;
  readonly isOnlineService: boolean;
  private _isListening;
  private initialized;
  private audioContext;
  private stream;
  constructor();
  initialize(config: STTConfig): Promise<void>;
  startListening(): Promise<void>;
  stopListening(): Promise<void>;
  isListening(): boolean;
  isInitialized(): boolean;
  setLanguage(language: string): void;
  destroy(): void;
  getCapabilities(): {
    streamingSupport: boolean;
    offlineSupport: boolean;
    languageDetection: boolean;
    punctuation: boolean;
    profanityFilter: boolean;
  };
  checkHealth(): Promise<{
    healthy: boolean;
    latency?: number;
    error?: string;
  }>;
  start(): Promise<void>;
  stop(): Promise<void>;
  isActive(): boolean;
  getStatus(): {
    isListening: boolean;
    engine: string;
  };
}
