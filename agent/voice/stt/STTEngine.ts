export type STTTranscript = { text: string; isFinal: boolean };

export interface STTEngine {
  start(): Promise<void>;
  stop(): Promise<void>;
  /** Fired for every partial / final transcript. */
  on(event: "transcript", cb: (t: STTTranscript) => void): void;
  /** Fired when the engine is unusable (network, auth, etc.). */
  on(event: "fatal", cb: (err: Error) => void): void;
}
