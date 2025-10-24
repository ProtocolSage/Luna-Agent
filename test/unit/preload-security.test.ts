/**
 * Preload Security Tests
 * Ensures no API keys are exposed to renderer process
 */

import { describe, it, expect } from "@jest/globals";
import * as fs from "fs";
import * as path from "path";

describe("Preload Security - Secret Scrubbing", () => {
  const preloadPath = path.join(__dirname, "../../app/main/preload.ts");
  let preloadCode: string;

  beforeAll(() => {
    preloadCode = fs.readFileSync(preloadPath, "utf8");
  });

  describe("API Key Exposure Prevention", () => {
    it("should NOT expose OPENAI_API_KEY to renderer", () => {
      expect(preloadCode).not.toMatch(
        /OPENAI_API_KEY:\s*process\.env\.OPENAI_API_KEY/,
      );
    });

    it("should NOT expose ANTHROPIC_API_KEY to renderer", () => {
      expect(preloadCode).not.toMatch(
        /ANTHROPIC_API_KEY:\s*process\.env\.ANTHROPIC_API_KEY/,
      );
    });

    it("should NOT expose AZURE_SPEECH_KEY to renderer", () => {
      expect(preloadCode).not.toMatch(
        /AZURE_SPEECH_KEY:\s*process\.env\.AZURE_SPEECH_KEY/,
      );
    });

    it("should NOT expose DEEPGRAM_API_KEY to renderer", () => {
      expect(preloadCode).not.toMatch(
        /DEEPGRAM_API_KEY:\s*process\.env\.DEEPGRAM_API_KEY/,
      );
    });

    it("should NOT expose GOOGLE_CLOUD_API_KEY to renderer", () => {
      expect(preloadCode).not.toMatch(
        /GOOGLE_CLOUD_API_KEY:\s*process\.env\.GOOGLE_CLOUD_API_KEY/,
      );
    });

    it("should NOT expose ELEVEN_API_KEY to renderer", () => {
      expect(preloadCode).not.toMatch(
        /ELEVEN_API_KEY:\s*process\.env\.ELEVEN_API_KEY/,
      );
    });

    it("should NOT expose PICOVOICE_ACCESS_KEY to renderer", () => {
      expect(preloadCode).not.toMatch(
        /PICOVOICE_ACCESS_KEY:\s*process\.env\.PICOVOICE_ACCESS_KEY/,
      );
    });

    it("should NOT expose any *_API_KEY pattern to renderer", () => {
      // Match pattern: SOMETHING_API_KEY: process.env.SOMETHING_API_KEY
      const apiKeyPattern = /\w+_API_KEY:\s*process\.env\.\w+_API_KEY/g;
      const matches = preloadCode.match(apiKeyPattern);

      expect(matches).toBeNull();
    });

    it("should NOT expose any *_KEY pattern to renderer", () => {
      // More general pattern for any keys
      const keyPattern = /\w+_KEY:\s*process\.env\.\w+_KEY/g;
      const matches = preloadCode.match(keyPattern);

      expect(matches).toBeNull();
    });
  });

  describe("Renderer configuration exposure", () => {
    it("should expose non-sensitive env values via __ENV", () => {
      const nonSensitivePatterns = [
        /LUNA_API_BASE:\s*process\.env\.LUNA_API_BASE/,
        /API_BASE:\s*process\.env\.API_BASE/,
        /STT_PROVIDER:\s*process\.env\.STT_PROVIDER\s*\|\|\s*["']azure["']/,
        /WAKE_WORD:\s*process\.env\.WAKE_WORD\s*\|\|\s*["']luna["']/,
        /AZURE_SPEECH_REGION:\s*process\.env\.AZURE_SPEECH_REGION/,
      ];

      nonSensitivePatterns.forEach((pattern) => {
        expect(preloadCode).toMatch(pattern);
      });
    });

    it("should expose feature flag booleans safely", () => {
      expect(preloadCode).toMatch(
        /VOICE_AUTO_LISTEN:\s*process\.env\.VOICE_AUTO_LISTEN === ["']true["']/,
      );
      expect(preloadCode).toMatch(
        /WAKE_WORD_ENABLED:\s*process\.env\.WAKE_WORD_ENABLED === ["']true["']/,
      );
      expect(preloadCode).toMatch(
        /VOICE_ENABLED:\s*process\.env\.VOICE_ENABLED === ["']true["']/,
      );
    });
  });

  describe("Security Comments", () => {
    it("should have comment explaining why keys are not exposed", () => {
      expect(preloadCode).toMatch(/SECURITY.*API keys.*NOT exposed/i);
    });

    it("should direct developers to use backend APIs", () => {
      expect(preloadCode).toMatch(/backend.*APIs.*server-side/i);
    });
  });

  describe("Regression Prevention", () => {
    it("should not add back OPENAI_API_KEY in future", () => {
      const forbiddenPatterns = [
        /OPENAI_API_KEY:\s*process\.env/,
        /ANTHROPIC_API_KEY:\s*process\.env/,
        /ELEVEN_API_KEY:\s*process\.env/,
        /DEEPGRAM_API_KEY:\s*process\.env/,
        /PICOVOICE_ACCESS_KEY:\s*process\.env/,
        /AZURE_SPEECH_KEY:\s*process\.env/,
      ];

      forbiddenPatterns.forEach((pattern) => {
        expect(preloadCode).not.toMatch(pattern);
      });
    });

    it("should not have hardcoded API keys", () => {
      const hardcodedKeyPatterns = [
        /sk-[a-zA-Z0-9]{20,}/, // OpenAI key format
        /sk-ant-[a-zA-Z0-9-]{20,}/, // Anthropic key format
        /AKIA[0-9A-Z]{16}/, // AWS key format
      ];

      hardcodedKeyPatterns.forEach((pattern) => {
        expect(preloadCode).not.toMatch(pattern);
      });
    });
  });

  describe("ContextBridge Safety", () => {
    it("should only use contextBridge.exposeInMainWorld for safe values", () => {
      // Extract all exposeInMainWorld calls
      const exposePattern = /contextBridge\.exposeInMainWorld\([^)]+\)/gs;
      const exposeCalls = preloadCode.match(exposePattern);

      expect(exposeCalls).toBeTruthy();

      exposeCalls?.forEach((call) => {
        // Should not contain API key environment variables
        expect(call).not.toMatch(/process\.env\.\w*API_KEY/);
        expect(call).not.toMatch(/process\.env\.\w*_KEY/);
      });
    });
  });
});

describe("Preload Type Safety", () => {
  // This ensures TypeScript types are aligned with actual exposed values
  it("should have matching __ENV type definition", () => {
    // Check if types file exists and is consistent
    const typesPath = path.join(__dirname, "../../types/window.d.ts");

    if (fs.existsSync(typesPath)) {
      const typesCode = fs.readFileSync(typesPath, "utf8");

      // If types define __ENV, they should NOT include API keys
      if (typesCode.includes("__ENV")) {
        expect(typesCode).not.toMatch(/OPENAI_API_KEY/);
        expect(typesCode).not.toMatch(/ANTHROPIC_API_KEY/);
        expect(typesCode).not.toMatch(/ELEVEN_API_KEY/);
      }
    }
  });
});

describe("Documentation", () => {
  it("should have security documentation for preload secrets", () => {
    const securityDocPath = path.join(
      __dirname,
      "../../docs/SECURITY-PRELOAD-SECRETS.md",
    );
    expect(fs.existsSync(securityDocPath)).toBe(true);
  });
});
