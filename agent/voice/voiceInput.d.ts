import { EventEmitter } from "events";
interface VoiceInputConfig {
  provider: "webSpeech" | "whisper" | "azure" | "google";
  apiKey?: string;
  language?: string;
  continuous?: boolean;
  interimResults?: boolean;
  maxAlternatives?: number;
  sampleRate?: number;
  silenceThreshold?: number;
  silenceDuration?: number;
}
interface TranscriptionResult {
  text: string;
  confidence: number;
  isFinal: boolean;
  alternatives?: Array<{
    text: string;
    confidence: number;
  }>;
  timestamp?: number;
}
export declare class VoiceInput extends EventEmitter {
  private config;
  private isRecording;
  private volumeInterval;
  private silenceTimeout;
  private silenceTimer;
  private recognition;
  private currentProvider;
  constructor(config: VoiceInputConfig);
  initialize(): Promise<void>;
  private initializeSTTProvider;
  private isWebSpeechAvailable;
  private initializeWebSpeech;
  startRecording(): Promise<void>;
  private startAudioRecording;
  private setupVolumeAnalysis;
  private handleLowVolume;
  private resetSilenceTimer;
  private handleSilence;
  stopRecording(): Promise<void>;
  processAudioBuffer(): Promise<void>;
  private transcribeWithWhisper;
  private transcribeWithAzure;
  private transcribeWithGoogle;
  transcribeFile(filePath: string): Promise<TranscriptionResult>;
  setLanguage(language: string): void;
  getConfig(): VoiceInputConfig;
  destroy(): void;
}
export declare function initializeVoiceInput(
  config: VoiceInputConfig,
): VoiceInput;
export declare function getVoiceInput(): VoiceInput | null;
export {};
