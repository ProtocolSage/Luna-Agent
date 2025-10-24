/**
 * Electron Security Configuration Tests
 *
 * Verifies that critical security settings are properly configured:
 * - Sandbox enabled globally and per-window
 * - Context isolation enabled
 * - Node integration disabled
 * - Web security enabled
 * - Permission handlers configured
 */

import { describe, it, expect, beforeEach, jest } from "@jest/globals";
import * as fs from "fs";
import * as path from "path";

describe("Electron Security Configuration", () => {
  const mainProcessPath = path.join(__dirname, "../../app/main/main.ts");
  let mainProcessCode: string;

  beforeEach(() => {
    mainProcessCode = fs.readFileSync(mainProcessPath, "utf8");
  });

  describe("Sandbox Configuration", () => {
    it("should enable sandbox globally via app.enableSandbox()", () => {
      expect(mainProcessCode).toContain("app.enableSandbox()");
      expect(mainProcessCode).toMatch(/app\.enableSandbox\(\)/);
    });

    it("should set sandbox: true in webPreferences", () => {
      expect(mainProcessCode).toContain("sandbox: true");
      expect(mainProcessCode).not.toContain("sandbox: false");
    });

    it("should have security comment explaining sandbox requirement", () => {
      expect(mainProcessCode).toMatch(/SECURITY.*sandbox/i);
    });
  });

  describe("Context Isolation", () => {
    it("should enable contextIsolation", () => {
      expect(mainProcessCode).toContain("contextIsolation: true");
      expect(mainProcessCode).not.toContain("contextIsolation: false");
    });

    it("should specify preload script for IPC bridge", () => {
      expect(mainProcessCode).toMatch(/preload:.*preload\.js/);
    });
  });

  describe("Node Integration", () => {
    it("should disable nodeIntegration", () => {
      expect(mainProcessCode).toContain("nodeIntegration: false");
      expect(mainProcessCode).not.toContain("nodeIntegration: true");
    });
  });

  describe("Web Security", () => {
    it("should enable webSecurity", () => {
      expect(mainProcessCode).toContain("webSecurity: true");
      expect(mainProcessCode).not.toContain("webSecurity: false");
    });

    it("should disable allowRunningInsecureContent", () => {
      expect(mainProcessCode).toContain("allowRunningInsecureContent: false");
    });

    it("should disable experimentalFeatures", () => {
      expect(mainProcessCode).toContain("experimentalFeatures: false");
    });
  });

  describe("Permission Handlers", () => {
    it("should implement setPermissionRequestHandler", () => {
      expect(mainProcessCode).toContain("setPermissionRequestHandler");
    });

    it("should allow only safe permissions (media, notifications)", () => {
      const permissionHandlerMatch = mainProcessCode.match(
        /allowedPermissions\s*=\s*\[(.*?)\]/s,
      );
      expect(permissionHandlerMatch).toBeTruthy();

      if (permissionHandlerMatch) {
        const permissions = permissionHandlerMatch[1];
        expect(permissions).toContain("media");
        expect(permissions).toContain("notifications");
        // Dangerous permissions should NOT be in allowlist
        expect(permissions).not.toContain("geolocation");
        expect(permissions).not.toContain("openExternal");
      }
    });
  });

  describe("Window Security", () => {
    it("should prevent new window creation", () => {
      expect(mainProcessCode).toContain("setWindowOpenHandler");
      expect(mainProcessCode).toMatch(/action:\s*['"]deny['"]/);
    });

    it("should block navigation to external URLs", () => {
      expect(mainProcessCode).toContain("will-navigate");
      expect(mainProcessCode).toContain("event.preventDefault()");
    });

    it("should open external URLs in system browser", () => {
      expect(mainProcessCode).toContain("shell.openExternal");
    });
  });

  describe("Content Security Policy", () => {
    it("should set Content-Security-Policy headers", () => {
      expect(mainProcessCode).toContain("Content-Security-Policy");
    });

    it("should use strict CSP directives", () => {
      const cspMatch = mainProcessCode.match(/csp\s*=\s*\[(.*?)\]/s);
      expect(cspMatch).toBeTruthy();

      if (cspMatch) {
        const csp = cspMatch[1];
        expect(csp).toContain("default-src 'self'");
        expect(csp).toContain("object-src 'none'");
        expect(csp).toContain("base-uri 'self'");
      }
    });

    it("should only allow localhost connections", () => {
      expect(mainProcessCode).toMatch(/connect-src[^"]*'self'/);
      expect(mainProcessCode).toMatch(/connect-src[^"]*(localhost|127\.0\.0\.1)/);
      expect(mainProcessCode).not.toMatch(/connect-src[^"]*\*/);
    });
  });

  describe("Media Permissions for Voice", () => {
    it("should enable WebRTC features for voice", () => {
      expect(mainProcessCode).toContain("WebRTCPipeWireCapturer");
      expect(mainProcessCode).toContain("enable-webrtc");
    });

    it("should configure autoplay policy for TTS", () => {
      expect(mainProcessCode).toMatch(
        /autoplayPolicy:\s*['"]no-user-gesture-required['"]/,
      );
    });

    it("should document that media works in sandbox mode", () => {
      expect(mainProcessCode).toMatch(/media.*sandbox/i);
    });
  });

  describe("Security Regression Prevention", () => {
    it("should NOT have any sandbox: false settings", () => {
      const sandboxFalseMatches = mainProcessCode.match(/sandbox:\s*false/g);
      expect(sandboxFalseMatches).toBeNull();
    });

    it("should NOT have nodeIntegration: true", () => {
      const nodeIntegrationMatches = mainProcessCode.match(
        /nodeIntegration:\s*true/g,
      );
      expect(nodeIntegrationMatches).toBeNull();
    });

    it("should NOT have contextIsolation: false", () => {
      const contextIsolationMatches = mainProcessCode.match(
        /contextIsolation:\s*false/g,
      );
      expect(contextIsolationMatches).toBeNull();
    });

    it("should NOT have webSecurity: false", () => {
      const webSecurityMatches = mainProcessCode.match(/webSecurity:\s*false/g);
      expect(webSecurityMatches).toBeNull();
    });
  });

  describe("Electron Module Loading", () => {
    it("should safely load electron module", () => {
      // Verify the electron loading logic handles both cases
      expect(mainProcessCode).toMatch(/require\(['"]electron['"]\)/);
      expect(mainProcessCode).toMatch(/typeof electron === ['"]string['"]/);
    });

    it("should verify app.whenReady is a function", () => {
      expect(mainProcessCode).toMatch(/typeof app\.whenReady !== ['"]function['"]/);
    });

    it("should exit on fatal electron loading errors", () => {
      expect(mainProcessCode).toMatch(/FATAL.*electron/i);
      expect(mainProcessCode).toContain("process.exit(1)");
    });
  });
});

describe("Bootstrap Script Security", () => {
  const bootstrapScriptPath = path.join(
    __dirname,
    "../../scripts/write-bootstrap.cjs",
  );
  let bootstrapCode: string;

  beforeEach(() => {
    if (fs.existsSync(bootstrapScriptPath)) {
      bootstrapCode = fs.readFileSync(bootstrapScriptPath, "utf8");
    }
  });

  it("should exist and be executable", () => {
    expect(fs.existsSync(bootstrapScriptPath)).toBe(true);
  });

  it("should intercept electron module loading", () => {
    expect(bootstrapCode).toContain("Module._load");
    expect(bootstrapCode).toContain("request === 'electron'");
  });

  it("should load electron/index.js for API access", () => {
    expect(bootstrapCode).toContain("index.js");
    expect(bootstrapCode).toContain("electronIndexPath");
  });

  it("should not disable security features", () => {
    expect(bootstrapCode).not.toContain("sandbox: false");
    expect(bootstrapCode).not.toContain("nodeIntegration: true");
  });
});
