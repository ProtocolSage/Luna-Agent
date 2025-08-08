/**
 * Speech-to-Text Interface
 * Defines the contract for all STT implementations
 */

export interface TranscriptionResult {
  text: string;
  confidence: number;
  isFinal: boolean;
  alternatives?: Array<{ text: string; confidence: number }>;
  timestamp?: number;
}

export interface STTConfig {
  language?: string;
  continuous?: boolean;
  interimResults?: boolean;
  maxAlternatives?: number;
  silenceDuration?: number;
}

export interface STTProvider {
  readonly name: string;
  readonly isOnlineService: boolean;
  
  initialize(config: STTConfig): Promise<void>;
  startListening(): Promise<void>;
  stopListening(): Promise<void>;
  isListening(): boolean;
  isInitialized(): boolean;
  setLanguage(language: string): void;
  destroy(): void;
  
  // Event emitter methods
  on(event: string, listener: (...args: any[]) => void): void;
  off(event: string, listener: (...args: any[]) => void): void;
  
  // Provider-specific capabilities
  getCapabilities(): {
    streamingSupport: boolean;
    offlineSupport: boolean;
    languageDetection: boolean;
    punctuation: boolean;
    profanityFilter: boolean;
  };
  
  // Health check for online services
  checkHealth(): Promise<{ healthy: boolean; latency?: number; error?: string }>;
}

export interface STTEventMap {
  'transcription': TranscriptionResult;
  'recording-started': void;
  'recording-stopped': void;
  'volume-level': number;
  'error': string;
  'network-error': { message: string; canRetry: boolean; fallbackAvailable: boolean };
  'service-unavailable': string;
  'service-restored': void;
}
