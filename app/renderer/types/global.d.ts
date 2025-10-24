export interface VoiceIPC {
  on: (event: string, callback: (...args: any[]) => void) => void;
  off: (event: string, callback: (...args: any[]) => void) => void;
  onSttTranscript: (
    callback: (data: { text: string; isFinal: boolean }) => void,
  ) => () => void;
  onListeningStarted: (callback: () => void) => () => void;
  onListeningStopped: (callback: () => void) => () => void;
  onMicPermission: (
    callback: (data: { granted: boolean }) => void,
  ) => () => void;
}

export interface STTService {
  start: () => Promise<any>;
  stop: () => Promise<void>;
  switchToCloud: () => Promise<any>;
  switchToWhisper: () => Promise<any>;
  getStatus: () => Promise<any>;
  setMaxListeners: (count: number) => void;
  onTranscript: (
    callback: (data: { text: string; isFinal: boolean }) => void,
  ) => () => void;
  onEngineSwitch: (
    callback: (info: { engine: string; isCloud: boolean }) => void,
  ) => () => void;
}

export interface ElectronAPI {
  platform: string;
  versions: {
    electron: string;
    node: string;
    chrome: string;
  };

  // IPC Communication
  invoke: (channel: string, ...args: any[]) => Promise<any>;
  on: (channel: string, callback: (...args: any[]) => void) => void;
  off: (channel: string, callback: (...args: any[]) => void) => void;

  // Voice-specific APIs
  voice: {
    startListening: () => Promise<boolean>;
    stopListening: () => Promise<void>;
    isListening: () => Promise<boolean>;
  };

  // Security
  sanitizeInput: (input: string) => string;

  // UI
  showNotification: (options: { title: string; body: string }) => Promise<void>;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
    voiceIPC: VoiceIPC;
    stt: STTService;

    // Web Speech API
    SpeechRecognition: typeof SpeechRecognition;
    webkitSpeechRecognition: typeof SpeechRecognition;

    // Audio context
    AudioContext: typeof AudioContext;
    webkitAudioContext: typeof AudioContext;
  }

  // Extend SpeechRecognition if not available globally
  interface SpeechRecognition extends EventTarget {
    continuous: boolean;
    interimResults: boolean;
    lang: string;
    maxAlternatives: number;
    serviceURI: string;
    grammars: SpeechGrammarList;

    start(): void;
    stop(): void;
    abort(): void;

    onaudiostart: ((this: SpeechRecognition, ev: Event) => any) | null;
    onsoundstart: ((this: SpeechRecognition, ev: Event) => any) | null;
    onspeechstart: ((this: SpeechRecognition, ev: Event) => any) | null;
    onspeechend: ((this: SpeechRecognition, ev: Event) => any) | null;
    onsoundend: ((this: SpeechRecognition, ev: Event) => any) | null;
    onaudioend: ((this: SpeechRecognition, ev: Event) => any) | null;
    onresult:
      | ((this: SpeechRecognition, ev: SpeechRecognitionEvent) => any)
      | null;
    onnomatch:
      | ((this: SpeechRecognition, ev: SpeechRecognitionEvent) => any)
      | null;
    onerror:
      | ((this: SpeechRecognition, ev: SpeechRecognitionErrorEvent) => any)
      | null;
    onstart: ((this: SpeechRecognition, ev: Event) => any) | null;
    onend: ((this: SpeechRecognition, ev: Event) => any) | null;
  }

  interface SpeechRecognitionEvent extends Event {
    readonly resultIndex: number;
    readonly results: SpeechRecognitionResultList;
  }

  interface SpeechRecognitionErrorEvent extends Event {
    readonly error: string;
    readonly message: string;
  }

  var SpeechRecognition: {
    prototype: SpeechRecognition;
    new (): SpeechRecognition;
  };

  var webkitSpeechRecognition: {
    prototype: SpeechRecognition;
    new (): SpeechRecognition;
  };
}
