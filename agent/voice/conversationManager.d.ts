import { EventEmitter } from "events";
interface ConversationConfig {
  wakeWord?: string;
  autoListen?: boolean;
  voiceActivityDetection?: boolean;
  interruptionEnabled?: boolean;
  maxSilenceDuration?: number;
  responseTimeout?: number;
  sttProvider?: "webSpeech" | "whisper" | "azure" | "google" | "dummy";
  apiKey?: string;
}
interface ConversationState {
  isListening: boolean;
  isSpeaking: boolean;
  isProcessing: boolean;
  currentTranscript: string;
  conversationHistory: Array<{
    role: "user" | "assistant";
    content: string;
    timestamp: number;
  }>;
  lastInteractionTime: number;
}
export declare class ConversationManager extends EventEmitter {
  private config;
  private state;
  private voiceInput;
  private voiceEngine;
  private wakeWordActive;
  private vadActive;
  private audioStream;
  private responseTimer;
  private silenceTimer;
  constructor(config?: ConversationConfig);
  initialize(): Promise<void>;
  private setupVoiceInputListeners;
  private initializeWakeWord;
  private setupWakeWordDetection;
  private initializeVAD;
  private handleWakeWord;
  startListening(): Promise<void>;
  stopListening(): Promise<void>;
  processUserInput(text: string): Promise<void>;
  private sendToAgent;
  speak(text: string): Promise<void>;
  stopSpeaking(): Promise<void>;
  private resetResponseTimer;
  private clearResponseTimer;
  private resetSilenceTimer;
  private clearSilenceTimer;
  private processEndOfSpeech;
  toggleListening(): Promise<void>;
  pushToTalk(pressed: boolean): Promise<void>;
  getState(): ConversationState;
  getConversationHistory(): Array<any>;
  clearHistory(): void;
  destroy(): Promise<void>;
}
export declare function initializeConversationManager(
  config?: ConversationConfig,
): ConversationManager;
export declare function getConversationManager(): ConversationManager | null;
export {};
