"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PIIFilter = void 0;
class PIIFilter {
    constructor() {
        this.patterns = new Map();
        this.initializePatterns();
    }
    initializePatterns() {
        // SSN patterns
        this.patterns.set('ssn', /\b(?:SSN\s*)?(?:\d{3}[-\s]?\d{2}[-\s]?\d{4})\b/gi);
        // Email patterns
        this.patterns.set('email', /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g);
        // Phone patterns
        this.patterns.set('phone', /\b(?:\+?1[-.\s]?)?\(?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})\b/g);
        // Credit card patterns
        this.patterns.set('credit_card', /\b(?:\d{4}[-\s]?){3}\d{4}\b/g);
        // API key patterns
        this.patterns.set('api_key', /\b(?:sk-|pk_|rk_)[a-zA-Z0-9]{20,}\b/g);
    }
    detect(text) {
        const detectedTypes = [];
        let redactedText = text;
        let totalMatches = 0;
        for (const [type, pattern] of this.patterns) {
            const matches = text.match(pattern);
            if (matches && matches.length > 0) {
                detectedTypes.push(type);
                totalMatches += matches.length;
                // Redact the matches
                redactedText = redactedText.replace(pattern, (match) => {
                    return '[REDACTED_' + type.toUpperCase() + ']';
                });
            }
        }
        const hasPII = detectedTypes.length > 0;
        const confidence = hasPII ? Math.min(0.95, 0.8 + (totalMatches * 0.1)) : 0.1;
        return {
            hasPII,
            detectedTypes,
            confidence,
            sanitizedText: redactedText
        };
    }
    sanitize(text) {
        const result = this.detect(text);
        return result.sanitizedText || text;
    }
    filter(text) {
        // Alias for sanitize method - filters out PII and returns clean text
        return this.sanitize(text);
    }
    isBlocked(text) {
        const result = this.detect(text);
        return result.hasPII && result.confidence > 0.7;
    }
}
exports.PIIFilter = PIIFilter;
