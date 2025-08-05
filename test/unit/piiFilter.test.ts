import { PIIFilter } from '../../agent/validators/piiFilter';

describe('PIIFilter', () => {
  let piiFilter: PIIFilter;

  beforeEach(() => {
    piiFilter = new PIIFilter();
  });

  describe('SSN detection', () => {
    it('should detect SSN with prefix', () => {
      const result = piiFilter.detect('SSN 123-45-6789');
      expect(result.hasPII).toBe(true);
      expect(result.detectedTypes).toContain('ssn');
      expect(result.sanitizedText).toBe('[REDACTED_SSN]');
      expect(result.confidence).toBeGreaterThan(0.7);
    });

    it('should detect SSN without prefix', () => {
      const result = piiFilter.detect('My number is 123-45-6789');
      expect(result.hasPII).toBe(true);
      expect(result.detectedTypes).toContain('ssn');
      expect(result.sanitizedText).toBe('My number is [REDACTED_SSN]');
    });

    it('should detect SSN with spaces', () => {
      const result = piiFilter.detect('123 45 6789');
      expect(result.hasPII).toBe(true);
      expect(result.detectedTypes).toContain('ssn');
    });

    it('should detect SSN without separators', () => {
      const result = piiFilter.detect('123456789');
      expect(result.hasPII).toBe(true);
      expect(result.detectedTypes).toContain('ssn');
    });

    it('should block SSN input', () => {
      const isBlocked = piiFilter.isBlocked('SSN 123-45-6789');
      expect(isBlocked).toBe(true);
    });
  });

  describe('Email detection', () => {
    it('should detect email addresses', () => {
      const result = piiFilter.detect('Contact me at john@example.com');
      expect(result.hasPII).toBe(true);
      expect(result.detectedTypes).toContain('email');
      expect(result.sanitizedText).toBe('Contact me at [REDACTED_EMAIL]');
    });

    it('should detect multiple emails', () => {
      const result = piiFilter.detect('john@example.com and jane@test.org');
      expect(result.hasPII).toBe(true);
      expect(result.detectedTypes).toContain('email');
      expect(result.sanitizedText).toBe('[REDACTED_EMAIL] and [REDACTED_EMAIL]');
    });
  });

  describe('Phone detection', () => {
    it('should detect phone numbers', () => {
      const result = piiFilter.detect('Call me at (555) 123-4567');
      expect(result.hasPII).toBe(true);
      expect(result.detectedTypes).toContain('phone');
      expect(result.sanitizedText).toBe('Call me at ([REDACTED_PHONE]');
    });

    it('should detect phone with different formats', () => {
      const testCases = [
        { input: '555-123-4567', expected: true },
        { input: '555.123.4567', expected: true },
        { input: '555 123 4567', expected: true },
        { input: '+1 555 123 4567', expected: true },
        { input: '(555) 123-4567', expected: true }
      ];

      testCases.forEach(({ input, expected }) => {
        const result = piiFilter.detect(input);
        if (expected) {
          expect(result.hasPII).toBe(true);
          expect(result.detectedTypes).toContain('phone');
        } else {
          expect(result.hasPII).toBe(false);
        }
      });
    });
  });

  describe('Credit card detection', () => {
    it('should detect credit card numbers', () => {
      const result = piiFilter.detect('Card: 4532 1234 5678 9012');
      expect(result.hasPII).toBe(true);
      expect(result.detectedTypes).toContain('credit_card');
      expect(result.sanitizedText).toBe('Card: [REDACTED_CREDIT_CARD]');
    });
  });

  describe('API key detection', () => {
    it('should detect OpenAI API keys', () => {
      const result = piiFilter.detect('sk-1234567890abcdef1234567890abcdef');
      expect(result.hasPII).toBe(true);
      expect(result.detectedTypes).toContain('api_key');
      expect(result.sanitizedText).toBe('[REDACTED_API_KEY]');
    });
  });

  describe('Multiple PII types', () => {
    it('should detect multiple PII types in one text', () => {
      const result = piiFilter.detect('SSN 123-45-6789 and email john@example.com');
      expect(result.hasPII).toBe(true);
      expect(result.detectedTypes).toContain('ssn');
      expect(result.detectedTypes).toContain('email');
      expect(result.sanitizedText).toBe('[REDACTED_SSN] and email [REDACTED_EMAIL]');
    });
  });

  describe('No PII', () => {
    it('should not detect PII in clean text', () => {
      const result = piiFilter.detect('This is a normal message without any sensitive information.');
      expect(result.hasPII).toBe(false);
      expect(result.detectedTypes).toHaveLength(0);
      expect(result.sanitizedText).toBe('This is a normal message without any sensitive information.');
    });

    it('should not block clean text', () => {
      const isBlocked = piiFilter.isBlocked('This is a normal message.');
      expect(isBlocked).toBe(false);
    });
  });

  describe('Sanitize method', () => {
    it('should return redacted text', () => {
      const sanitized = piiFilter.sanitize('My SSN is 123-45-6789 and email is john@example.com');
      expect(sanitized).toBe('My SSN is [REDACTED_SSN] and email is [REDACTED_EMAIL]');
    });
  });
});

