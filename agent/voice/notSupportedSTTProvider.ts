import { EventEmitter } from "events";

/**
 * Fallback STT provider for environments where speech-to-text is not available.
 * Emits an error immediately on start, and does nothing on stop.
 */
export class NotSupportedSTTProvider extends EventEmitter {
  start(): void {
    this.emit(
      "error",
      new Error(
        "Speech-to-text is not supported in the Electron main process.",
      ),
    );
  }
  stop(): void {}
}
