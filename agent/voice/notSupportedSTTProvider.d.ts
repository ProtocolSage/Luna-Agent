import { EventEmitter } from "events";
/**
 * Fallback STT provider for environments where speech-to-text is not available.
 * Emits an error immediately on start, and does nothing on stop.
 */
export declare class NotSupportedSTTProvider extends EventEmitter {
  start(): void;
  stop(): void;
}
