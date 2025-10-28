// Electron Security Configuration Tests
import * as fs from 'fs';
import * as path from 'path';

describe('Electron Security Configuration', () => {
  const mainFilePath = path.join(__dirname, '../../app/main/main.ts');
  
  describe('Sandbox Configuration', () => {
    it('should have sandbox enabled in main.ts source', () => {
      const mainContent = fs.readFileSync(mainFilePath, 'utf-8');
      
      // Check that sandbox is set to true
      expect(mainContent).toContain('sandbox: true');
      
      // Should NOT contain sandbox: false
      expect(mainContent).not.toContain('sandbox: false');
    });

    it('should have proper comment explaining sandbox security', () => {
      const mainContent = fs.readFileSync(mainFilePath, 'utf-8');
      
      // Check for security-related comment about sandbox
      expect(mainContent).toMatch(/sandbox:.*security.*media/i);
    });
  });

  describe('Context Isolation', () => {
    it('should have contextIsolation enabled', () => {
      const mainContent = fs.readFileSync(mainFilePath, 'utf-8');
      
      expect(mainContent).toContain('contextIsolation: true');
    });

    it('should have nodeIntegration disabled', () => {
      const mainContent = fs.readFileSync(mainFilePath, 'utf-8');
      
      expect(mainContent).toContain('nodeIntegration: false');
    });
  });

  describe('Media Permissions', () => {
    it('should have media permission handler configured', () => {
      const mainContent = fs.readFileSync(mainFilePath, 'utf-8');
      
      // Check for permission handler
      expect(mainContent).toContain('setPermissionRequestHandler');
      
      // Check for media-related permissions
      expect(mainContent).toMatch(/media|microphone|audioCapture/i);
    });

    it('should grant specific media permissions only', () => {
      const mainContent = fs.readFileSync(mainFilePath, 'utf-8');
      
      // Check that we have an allowlist of permissions
      expect(mainContent).toContain('allowedPermissions');
      
      // Check for specific allowed permissions
      const expectedPermissions = ['media', 'microphone', 'audioCapture'];
      expectedPermissions.forEach(permission => {
        expect(mainContent).toContain(permission);
      });
    });
  });

  describe('Preload Script Security', () => {
    const preloadFilePath = path.join(__dirname, '../../app/main/preload.ts');
    
    it('should use contextBridge API', () => {
      const preloadContent = fs.readFileSync(preloadFilePath, 'utf-8');
      
      expect(preloadContent).toContain('contextBridge');
      expect(preloadContent).toContain('exposeInMainWorld');
    });

    it('should not directly expose Node.js APIs', () => {
      const preloadContent = fs.readFileSync(preloadFilePath, 'utf-8');
      
      // Should not expose require, fs, or other Node.js APIs directly
      expect(preloadContent).not.toMatch(/exposeInMainWorld.*require/);
      expect(preloadContent).not.toMatch(/exposeInMainWorld.*fs/);
      expect(preloadContent).not.toMatch(/exposeInMainWorld.*child_process/);
    });

    it('should only use ipcRenderer for IPC communication', () => {
      const preloadContent = fs.readFileSync(preloadFilePath, 'utf-8');
      
      expect(preloadContent).toContain('ipcRenderer');
      // Should not use ipcMain (that's for main process only)
      expect(preloadContent).not.toContain('ipcMain');
    });
  });

  describe('Content Security Policy', () => {
    it('should have CSP header injection', () => {
      const mainContent = fs.readFileSync(mainFilePath, 'utf-8');
      
      expect(mainContent).toContain('Content-Security-Policy');
    });

    it('should have restrictive default-src directive', () => {
      const mainContent = fs.readFileSync(mainFilePath, 'utf-8');
      
      expect(mainContent).toContain("default-src 'self'");
    });

    it('should allow media-src for blob URLs', () => {
      const mainContent = fs.readFileSync(mainFilePath, 'utf-8');
      
      // Media recording needs blob: URLs
      expect(mainContent).toMatch(/media-src.*blob/i);
    });

    it('should have secure script-src directive without eval', () => {
      const mainContent = fs.readFileSync(mainFilePath, 'utf-8');
      
      expect(mainContent).toContain("script-src 'self'");
      // Should NOT allow unsafe-eval
      expect(mainContent).not.toContain("'unsafe-eval'");
    });
  });

  describe('Web Security', () => {
    it('should have webSecurity enabled', () => {
      const mainContent = fs.readFileSync(mainFilePath, 'utf-8');
      
      expect(mainContent).toContain('webSecurity: true');
    });

    it('should not allow insecure content', () => {
      const mainContent = fs.readFileSync(mainFilePath, 'utf-8');
      
      expect(mainContent).toContain('allowRunningInsecureContent: false');
    });

    it('should prevent new window creation', () => {
      const mainContent = fs.readFileSync(mainFilePath, 'utf-8');
      
      expect(mainContent).toContain('setWindowOpenHandler');
      expect(mainContent).toMatch(/action.*deny/i);
    });
  });

  describe('App-level Sandbox', () => {
    it('should call app.enableSandbox()', () => {
      const mainContent = fs.readFileSync(mainFilePath, 'utf-8');
      
      expect(mainContent).toContain('app.enableSandbox()');
    });
  });
});
