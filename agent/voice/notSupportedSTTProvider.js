"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotSupportedSTTProvider = void 0;
const events_1 = require("events");
/**
 * Fallback STT provider for environments where speech-to-text is not available.
 * Emits an error immediately on start, and does nothing on stop.
 */
class NotSupportedSTTProvider extends events_1.EventEmitter {
    start() {
        this.emit('error', new Error('Speech-to-text is not supported in the Electron main process.'));
    }
    stop() { }
}
exports.NotSupportedSTTProvider = NotSupportedSTTProvider;
//# sourceMappingURL=notSupportedSTTProvider.js.map