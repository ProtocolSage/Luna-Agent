"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PhraseCache = void 0;
const crypto_1 = require("crypto");
class PhraseCache {
    constructor() {
        this.maxItems = 200; // tweak to taste
        this.store = new Map();
    }
    hash(text) {
        return crypto_1.default.createHash('sha1').update(text).digest('hex');
    }
    get(text) {
        const key = this.hash(text);
        return this.store.get(key);
    }
    set(text, audio) {
        const key = this.hash(text);
        this.store.set(key, audio);
        // rudimentary LRU eviction
        if (this.store.size > this.maxItems) {
            const first = this.store.keys().next().value;
            this.store.delete(first);
        }
    }
    clear() {
        this.store.clear();
    }
    size() {
        return this.store.size;
    }
}
exports.PhraseCache = PhraseCache;
//# sourceMappingURL=cache.js.map