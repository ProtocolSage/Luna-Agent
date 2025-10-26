// App Boot Configuration Validation Test
// Validates that the app configuration is correct for booting with sandbox enabled

import * as fs from 'fs';
import * as path from 'path';

describe('App Boot Configuration', () => {
  describe('Build Artifacts', () => {
    it('should have main process build output', () => {
      const mainPath = path.join(__dirname, '../../dist/app/main/main.js');
      expect(fs.existsSync(mainPath)).toBe(true);
    });

    it('should have preload script build output', () => {
      const preloadPath = path.join(__dirname, '../../dist/app/main/preload.js');
      expect(fs.existsSync(preloadPath)).toBe(true);
    });

    it('should have backend server build output', () => {
      const backendPath = path.join(__dirname, '../../dist/backend/server.js');
      expect(fs.existsSync(backendPath)).toBe(true);
    });
  });

  describe('Main Process Configuration', () => {
    const mainJsPath = path.join(__dirname, '../../dist/app/main/main.js');
    
    it('should have sandbox enabled in built output', () => {
      const mainContent = fs.readFileSync(mainJsPath, 'utf-8');
      
      // Verify sandbox is enabled in the built file
      expect(mainContent).toContain('sandbox: true');
    });

    it('should have permission handler in built output', () => {
      const mainContent = fs.readFileSync(mainJsPath, 'utf-8');
      
      expect(mainContent).toContain('setPermissionRequestHandler');
      expect(mainContent).toContain('allowedPermissions');
    });

    it('should have app.enableSandbox() call', () => {
      const mainContent = fs.readFileSync(mainJsPath, 'utf-8');
      
      expect(mainContent).toContain('app.enableSandbox()');
    });
  });

  describe('Preload Script Configuration', () => {
    const preloadJsPath = path.join(__dirname, '../../dist/app/main/preload.js');
    
    it('should use contextBridge in built output', () => {
      const preloadContent = fs.readFileSync(preloadJsPath, 'utf-8');
      
      expect(preloadContent).toContain('contextBridge');
    });

    it('should expose necessary APIs for voice functionality', () => {
      const preloadContent = fs.readFileSync(preloadJsPath, 'utf-8');
      
      // Check for voice IPC exposure
      expect(preloadContent).toMatch(/voiceIPC|__ENV/);
    });
  });

  describe('Security Configuration Consistency', () => {
    it('should have consistent security settings between source and build', () => {
      const sourcePath = path.join(__dirname, '../../app/main/main.ts');
      const buildPath = path.join(__dirname, '../../dist/app/main/main.js');
      
      const sourceContent = fs.readFileSync(sourcePath, 'utf-8');
      const buildContent = fs.readFileSync(buildPath, 'utf-8');
      
      // Both should have sandbox enabled
      expect(sourceContent).toContain('sandbox: true');
      expect(buildContent).toContain('sandbox: true');
      
      // Both should have contextIsolation enabled
      expect(sourceContent).toContain('contextIsolation: true');
      expect(buildContent).toContain('contextIsolation: true');
      
      // Both should have nodeIntegration disabled
      expect(sourceContent).toContain('nodeIntegration: false');
      expect(buildContent).toContain('nodeIntegration: false');
    });
  });

  describe('Boot Prerequisites', () => {
    it('should have required packages installed', () => {
      const packageJsonPath = path.join(__dirname, '../../package.json');
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
      
      // Check for essential dependencies
      expect(packageJson.dependencies).toBeDefined();
      expect(packageJson.devDependencies).toBeDefined();
      expect(packageJson.devDependencies.electron).toBeDefined();
    });

    it('should have valid package.json main entry point', () => {
      const packageJsonPath = path.join(__dirname, '../../package.json');
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
      
      expect(packageJson.main).toBeDefined();
      expect(packageJson.main).toBeTruthy();
    });

    it('should have build scripts configured', () => {
      const packageJsonPath = path.join(__dirname, '../../package.json');
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
      
      expect(packageJson.scripts).toBeDefined();
      expect(packageJson.scripts['build:main']).toBeDefined();
      expect(packageJson.scripts['build:preload']).toBeDefined();
      expect(packageJson.scripts.build).toBeDefined();
    });
  });

  describe('Media Permission Configuration', () => {
    const mainJsPath = path.join(__dirname, '../../dist/app/main/main.js');
    
    it('should grant microphone permission', () => {
      const mainContent = fs.readFileSync(mainJsPath, 'utf-8');
      
      expect(mainContent).toMatch(/microphone|media/i);
      expect(mainContent).toContain('allowedPermissions');
    });

    it('should grant audio capture permission', () => {
      const mainContent = fs.readFileSync(mainJsPath, 'utf-8');
      
      expect(mainContent).toMatch(/audioCapture|media/i);
    });

    it('should log permission grants for debugging', () => {
      const mainContent = fs.readFileSync(mainJsPath, 'utf-8');
      
      expect(mainContent).toMatch(/permission.*granted|Media permission/i);
    });
  });

  describe('CSP Configuration for Sandbox', () => {
    const mainJsPath = path.join(__dirname, '../../dist/app/main/main.js');
    
    it('should have CSP that allows media sources', () => {
      const mainContent = fs.readFileSync(mainJsPath, 'utf-8');
      
      // CSP must allow blob: for media recording
      expect(mainContent).toMatch(/media-src.*blob/i);
    });

    it('should have CSP that restricts script sources', () => {
      const mainContent = fs.readFileSync(mainJsPath, 'utf-8');
      
      // Should not allow unsafe-eval with sandbox
      expect(mainContent).not.toContain("'unsafe-eval'");
    });
  });
});
