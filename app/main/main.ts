// Types only (compile-time)
import type { IpcMainInvokeEvent, WebContents } from 'electron';
import * as path from 'path';
import { spawn, ChildProcess } from 'child_process';

// Runtime Electron import - CRITICAL FIX for electron module resolution
// When require('electron') is called, it returns the path to electron.exe (a string)
// instead of the Electron API object. We need to load electron/index.js directly.
let electron: any;
try {
  // First try: standard require (works in properly configured environments)
  electron = require('electron');

  // If we got a string instead of an object, electron module resolution is broken
  if (typeof electron === 'string') {
    console.log('[Main] Electron resolved to path string, loading index.js directly...');

    // Find the electron module directory
    const electronModulePath = require.resolve('electron');
    const electronDir = path.dirname(electronModulePath);
    const electronIndexPath = path.join(electronDir, 'index.js');

    // Load the actual electron API from index.js
    electron = require(electronIndexPath);
    console.log('[Main] Loaded Electron API from:', electronIndexPath);
  }
} catch (error) {
  console.error('[Main] FATAL: Failed to load Electron module:', error);
  process.exit(1);
}

const app = electron.app;
const BrowserWindow = electron.BrowserWindow;
const ipcMain = electron.ipcMain;
const shell = electron.shell;
const dialog = electron.dialog;
const Menu = electron.Menu;
const globalShortcut = electron.globalShortcut;

// Verify Electron loaded correctly
if (!app || typeof app.whenReady !== 'function') {
  console.error('[Main] FATAL: Electron did not load correctly!');
  console.error('[Main] typeof electron:', typeof electron);
  console.error('[Main] electron value:', electron);
  process.exit(1);
}

console.log('[Main] Electron loaded successfully');

// Create a simple logger fallback if the main logger fails
const logger = {
  info: (msg: string, category: string = '', data?: any) => console.log(`[${category}] ${msg}`, data || ''),
  warn: (msg: string, category: string = '', data?: any) => console.warn(`[${category}] ${msg}`, data || ''),
  error: (msg: string, error?: Error, category: string = '') => console.error(`[${category}] ${msg}`, error)
};

// Load environment variables early
try {
  require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });
  console.log('[Main] Environment variables loaded from .env');
} catch (error) {
  console.warn('[Main] Failed to load .env file:', error);
}

/**
 * Luna Agent Electron Main Process
 * Features: Secure configuration, IPC handlers, Voice integration, Auto-updater
 */

interface WindowState {
  width: number;
  height: number;
  x?: number;
  y?: number;
  isMaximized: boolean;
  isFullscreen: boolean;
}

class LunaMainProcess {
  private mainWindow: Electron.BrowserWindow | null = null;
  private serverProcess: ChildProcess | null = null;
  private isDevelopment = process.env.NODE_ENV === 'development';
  private windowState: WindowState = {
    width: 1400,
    height: 900,
    isMaximized: false,
    isFullscreen: false
  };

  constructor() {
    this.setupApp();
    this.registerIpcHandlers();
    this.setupGlobalShortcuts();
  }

  private setupApp(): void {
    // Security: Enable sandbox for all renderers (must be called before app is ready)
    if (app && typeof app.enableSandbox === 'function') {
      app.enableSandbox();
    
    // Media permissions for voice recording
    app.commandLine.appendSwitch('enable-features', 'WebRTCPipeWireCapturer');
    app.commandLine.appendSwitch('enable-webrtc');
    }

    // Handle app events
    app.whenReady().then(() => {
      this.createMainWindow();
      this.startBackendServer();
      this.setupApplicationMenu();
    });

    app.on('window-all-closed', () => {
      this.cleanup();
      if (process.platform !== 'darwin') {
        app.quit();
      }
    });

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        this.createMainWindow();
      }
    });

    app.on('before-quit', () => {
      this.cleanup();
    });

    // Security: Prevent new window creation
    app.on('web-contents-created', (event: unknown, contents: WebContents) => {
      contents.setWindowOpenHandler(({ url }: { url: string }) => {
        shell.openExternal(url);
        return { action: 'deny' };
      });

      contents.setWindowOpenHandler(() => {
        return { action: 'deny' };
      });

      // Grant media permissions for voice functionality with sandbox enabled
      contents.session.setPermissionRequestHandler((webContents, permission, callback) => {
        const allowedPermissions = ['media', 'microphone', 'audioCapture', 'mediaKeySystem'];
        if (allowedPermissions.includes(permission)) {
          logger.info(`Media permission granted: ${permission}`, 'main-process');
          callback(true);
        } else {
          logger.warn(`Permission denied: ${permission}`, 'main-process');
          callback(false);
        }
      });
    });
  }

  private createMainWindow(): void {
    // Load saved window state
    this.loadWindowState();

    // Inject strong Content-Security-Policy via response headers
    // Must be set before any renderer content is loaded
    try {
      const { session } = require('electron');
      const defaultSession = session.defaultSession;
      if (defaultSession && defaultSession.webRequest) {
        // Ensure we only register once
        if (!(defaultSession as any).__luna_csp_registered) {
          (defaultSession as any).__luna_csp_registered = true;
          defaultSession.webRequest.onHeadersReceived((details: any, callback: any) => {
            const csp = [
              "default-src 'self'",
              "script-src 'self'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob: file:",
              "font-src 'self' data:",
              "connect-src 'self' http://localhost:3000 http://127.0.0.1:3000 ws://localhost:3000 ws://127.0.0.1:3000 http://localhost:5173 ws://localhost:5173",
              "media-src 'self' blob: data:",
              "object-src 'none'",
              "base-uri 'self'"
            ].join('; ');
            callback({
              responseHeaders: {
                ...details.responseHeaders,
                'Content-Security-Policy': [csp],
              }
            });
          });
          logger.info('CSP header injection registered', 'main-process');
        }
      }
    } catch (e) {
      logger.warn('Failed to register CSP header injection', 'main-process', { error: e instanceof Error ? e.message : String(e) });
    }

    this.mainWindow = new BrowserWindow({
      width: this.windowState.width,
      height: this.windowState.height,
      x: this.windowState.x,
      y: this.windowState.y,
      minWidth: 800,
      minHeight: 600,
      show: false, // Don't show until ready
      title: 'Luna Agent - Production AI Assistant',
      icon: (() => {
        const iconName = process.platform === 'win32' ? 'icon.ico'
                       : process.platform === 'darwin' ? 'icon.icns' 
                       : 'icon.png';
        // Try project root assets first
        let iconPath = path.join(__dirname, '..', '..', '..', 'assets', iconName);
        if (!require('fs').existsSync(iconPath)) {
          // Fallback to dist/assets if available
          iconPath = path.join(__dirname, '..', 'assets', iconName);
        }
        return iconPath;
      })(),
      titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
      titleBarOverlay: process.platform === 'win32' ? {
        color: '#1a1a2e',
        symbolColor: '#ffffff'
      } : false,
      webPreferences: {
        // Security: Critical settings
        nodeIntegration: false,
        contextIsolation: true,
        // enableRemoteModule deprecated in newer Electron versions
        sandbox: true, // Enabled for security - media access works with proper permissions
        preload: path.join(__dirname, 'preload.js'),
        
        // Performance and features
        webSecurity: true,
        allowRunningInsecureContent: false,
        experimentalFeatures: false,
        enableBlinkFeatures: '',
        disableBlinkFeatures: '',
        
        // Media permissions for voice
        // enableWebRTC deprecated in newer Electron versions
        autoplayPolicy: 'no-user-gesture-required' // Allow autoplay for TTS
      }
    });

    // Load the renderer - support both dev server and file mode
    const apiBase = process.env.LUNA_API_BASE || process.env.API_BASE || 'http://localhost:3000';
    
    // Check if we're in dev server mode
    const rendererUrl = process.env.ELECTRON_RENDERER_URL;
    
    if (rendererUrl) {
      // Dev server mode - load from webpack-dev-server
      console.log('[main-process] Loading renderer from dev server:', rendererUrl);
      this.mainWindow?.loadURL(`${rendererUrl}?apiBase=${encodeURIComponent(apiBase)}`);
    } else {
      // File mode - load from built files
      // The renderer is built to dist/app/renderer/index.html
      // From dist/app/main/, we need to go to ../renderer/index.html
      const rendererFile = path.join(__dirname, '..', 'renderer', 'index.html');
      console.log('[main-process] Loading renderer from file:', rendererFile);
      
      if (!require('fs').existsSync(rendererFile)) {
        console.error('[main-process] Renderer file not found! Run npm run build:renderer first');
        dialog.showErrorBox('Renderer Not Built', 
          'The renderer files have not been built.\n\n' +
          'Please run: npm run build:renderer\n' +
          'Then restart the application.');
      } else {
        this.mainWindow?.loadFile(rendererFile, { query: { apiBase } });
      }
    }
    
    // Open dev tools in development
    if (this.isDevelopment) {
      this.mainWindow?.webContents.openDevTools();
    }

    // Window event handlers
    this.mainWindow?.once('ready-to-show', () => {
      if (!this.mainWindow) return;

      // Restore window state
      if (this.windowState.isMaximized) {
        this.mainWindow?.maximize();
      }
      if (this.windowState.isFullscreen) {
        this.mainWindow?.setFullScreen(true);
      }

      this.mainWindow?.show();
      this.mainWindow?.focus();

      logger.info('Main window ready and shown', 'main-process');
    });

    this.mainWindow?.on('close', () => {
      this.saveWindowState();
    });

    this.mainWindow?.on('closed', () => {
      this.mainWindow = null;
    });

    // Window state tracking
    this.mainWindow?.on('maximize', () => {
      this.windowState.isMaximized = true;
      this.notifyRendererOfWindowState();
    });

    this.mainWindow?.on('unmaximize', () => {
      this.windowState.isMaximized = false;
      this.notifyRendererOfWindowState();
    });

    this.mainWindow?.on('enter-full-screen', () => {
      this.windowState.isFullscreen = true;
      this.notifyRendererOfWindowState();
    });

    this.mainWindow?.on('leave-full-screen', () => {
      this.windowState.isFullscreen = false;
      this.notifyRendererOfWindowState();
    });

    this.mainWindow?.on('moved', () => {
      this.saveWindowBounds();
    });

    this.mainWindow?.on('resized', () => {
      this.saveWindowBounds();
    });

    logger.info('Main window created', 'main-process', {
      dimensions: `${this.windowState.width}x${this.windowState.height}`,
      development: this.isDevelopment
    });
  }

  private async startBackendServer(): Promise<void> {
    // In packaged app, start the backend server automatically
    const isDev = process.env.NODE_ENV === 'development';
    
    if (!isDev) {
      // Production: Start backend server from packaged resources
      const { spawn } = require('child_process');
      const fs = require('fs');
      
      // In packaged Electron apps, __dirname points to the asar bundle
      // We need to find the backend server in the bundled app
      let serverPath = path.join(__dirname, '..', '..', 'backend', 'server.js');
      
      // Try alternative paths if not found
      if (!fs.existsSync(serverPath)) {
        serverPath = path.join(process.resourcesPath, 'app', 'dist', 'backend', 'server.js');
      }
      if (!fs.existsSync(serverPath)) {
        serverPath = path.join(process.resourcesPath, 'backend', 'server.js');
      }
      if (!fs.existsSync(serverPath)) {
        // Last resort: try in app.asar
        serverPath = path.join(__dirname, 'backend', 'server.js');
      }
      
      if (fs.existsSync(serverPath)) {
        console.log('[Main] Starting backend server:', serverPath);
        this.serverProcess = spawn('node', [serverPath], {
          env: { ...process.env, PORT: '3000' },
          stdio: 'pipe'
        });
        
        if (this.serverProcess && this.serverProcess.stdout) {
          this.serverProcess.stdout.on('data', (data) => {
            console.log(`[Backend] ${data}`);
          });
        }
        
        if (this.serverProcess && this.serverProcess.stderr) {
          this.serverProcess.stderr.on('data', (data) => {
            console.error(`[Backend Error] ${data}`);
          });
        }
        
        if (this.serverProcess) {
          this.serverProcess.on('close', (code) => {
            console.log(`[Backend] Process exited with code ${code}`);
          });
        }
        
        // Wait for server to start
        await new Promise(resolve => setTimeout(resolve, 3000));
      } else {
        console.warn('[Main] Backend server not found. Tried paths:');
        console.warn('  ', path.join(__dirname, '..', '..', 'backend', 'server.js'));
        console.warn('  ', path.join(process.resourcesPath, 'app', 'dist', 'backend', 'server.js'));
        console.warn('  ', path.join(process.resourcesPath, 'backend', 'server.js'));
        console.warn('  ', path.join(__dirname, 'backend', 'server.js'));
        console.warn('[Main] App will try to connect to external backend at localhost:3000');
      }
    } else {
      // Development: Backend started externally
      logger.info('Backend server should be started externally (npm run backend)', 'main-process');
    }
    return;
  }

  private registerIpcHandlers(): void {
    // Window control handlers
    ipcMain.handle('window:minimize', () => {
      this.mainWindow?.minimize();
    });

    ipcMain.handle('window:maximize', () => {
      if (this.mainWindow?.isMaximized()) {
        this.mainWindow.unmaximize();
      } else {
        this.mainWindow?.maximize();
      }
    });

    ipcMain.handle('window:close', () => {
      this.mainWindow?.close();
    });

    ipcMain.handle('window:toggle-fullscreen', () => {
      const isFullScreen = this.mainWindow?.isFullScreen() || false;
      this.mainWindow?.setFullScreen(!isFullScreen);
    });

    // File system handlers
    ipcMain.handle('dialog:open-file', async (_event: IpcMainInvokeEvent, options: Record<string, unknown> = {}) => {
      if (!this.mainWindow) return { canceled: true };

      const result = await dialog.showOpenDialog(this.mainWindow, {
        properties: ['openFile'],
        filters: [
          { name: 'All Files', extensions: ['*'] },
          { name: 'Text Files', extensions: ['txt', 'md', 'json'] },
          { name: 'Audio Files', extensions: ['wav', 'mp3', 'ogg', 'm4a'] },
          { name: 'Image Files', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'] }
        ],
        ...options
      });

      return result;
    });

    ipcMain.handle('dialog:save-file', async (_event: IpcMainInvokeEvent, options: Record<string, unknown> = {}) => {
      if (!this.mainWindow) return { canceled: true };

      const result = await dialog.showSaveDialog(this.mainWindow, {
        filters: [
          { name: 'All Files', extensions: ['*'] },
          { name: 'Text Files', extensions: ['txt', 'md'] },
          { name: 'JSON Files', extensions: ['json'] }
        ],
        ...options
      });

      return result;
    });

    // Voice handlers
    ipcMain.handle('voice:get-devices', async () => {
      try {
        // Get available audio devices
        return await this.getAudioDevices();
      } catch (error) {
        logger.error('Failed to get audio devices', error as Error, 'main-process');
        return [];
      }
    });

    ipcMain.handle('voice:start-recording', async (_event: IpcMainInvokeEvent, options: Record<string, unknown> = {}) => {
      try {
        // Initialize voice recording
        logger.info('Voice recording started', 'main-process', options);
        return { success: true };
      } catch (error) {
        logger.error('Failed to start voice recording', error as Error, 'main-process');
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
      }
    });

    ipcMain.handle('voice:stop-recording', async () => {
      try {
        // Stop voice recording
        logger.info('Voice recording stopped', 'main-process');
        return { success: true };
      } catch (error) {
        logger.error('Failed to stop voice recording', error as Error, 'main-process');
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
      }
    });

    // System handlers
    ipcMain.handle('system:get-info', () => {
      return {
        platform: process.platform,
        arch: process.arch,
        version: process.version,
        electronVersion: process.versions.electron,
        appVersion: app.getVersion()
      };
    });

    ipcMain.handle('system:open-external', async (_event: IpcMainInvokeEvent, url: string) => {
      try {
        await shell.openExternal(url);
        return { success: true };
      } catch (error) {
        logger.error('Failed to open external URL', error as Error, 'main-process');
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
      }
    });

    // App control handlers
    ipcMain.handle('app:restart', () => {
      app.relaunch();
      app.exit(0);
    });

    ipcMain.handle('app:quit', () => {
      app.quit();
    });

    ipcMain.handle('app:get-version', () => {
      return app.getVersion();
    });

    // Notification handlers
    ipcMain.handle('notification:show', (_event: IpcMainInvokeEvent, options: { title?: string; body?: string; [key: string]: any }) => {
      // Use Electron's native notification system
      const { Notification } = require('electron');
      if (Notification.isSupported()) {
        const notification = new Notification({
          title: options.title || 'Luna Agent',
          body: options.body || '',
          icon: path.join(__dirname, '../assets/icon.png'),
          ...options
        });
        notification.show();
      }
    });

    // STT handlers - bridge to renderer STT processing
    ipcMain.handle('stt:start', async () => {
      // STT is handled in renderer, just return success
      return { success: true };
    });

    ipcMain.handle('stt:stop', async () => {
      // STT is handled in renderer, just return success
      return { success: true };
    });

    ipcMain.handle('stt:get-status', async () => {
      // Return basic STT status
      return {
        isListening: false,
        currentProvider: 'webSpeech',
        providers: ['webSpeech', 'whisper'],
        supported: true
      };
    });

    ipcMain.handle('stt:switch-to-cloud', async () => {
      // Cloud STT switching handled in renderer
      return { success: true };
    });

    ipcMain.handle('stt:switch-to-whisper', async () => {
      // Whisper STT switching handled in renderer
      return { success: true };
    });

    ipcMain.handle('stt:health-check', async () => {
      // Basic health check for STT services
      return { 
        status: 'ok',
        webSpeech: true,
        whisper: true,
        timestamp: new Date().toISOString()
      };
    });

    logger.info('IPC handlers registered', 'main-process');
  }

  private setupGlobalShortcuts(): void {
    app.whenReady().then(() => {
      // Register global shortcuts
      globalShortcut.register('CommandOrControl+Shift+L', () => {
        if (this.mainWindow) {
          if (this.mainWindow.isVisible()) {
            this.mainWindow.hide();
          } else {
            this.mainWindow.show();
            this.mainWindow.focus();
          }
        }
      });

      // Voice activation shortcut
      globalShortcut.register('CommandOrControl+Space', () => {
        this.mainWindow?.webContents.send('shortcut:voice-activate');
      });

      logger.info('Global shortcuts registered', 'main-process');
    });

    app.on('will-quit', () => {
      globalShortcut.unregisterAll();
    });
  }

  private setupApplicationMenu(): void {
    const template: Electron.MenuItemConstructorOptions[] = [
      {
        label: 'File',
        submenu: [
          {
            label: 'New Conversation',
            accelerator: 'CmdOrCtrl+N',
            click: () => {
              this.mainWindow?.webContents.send('menu:new-conversation');
            }
          },
          {
            label: 'Open File',
            accelerator: 'CmdOrCtrl+O',
            click: async () => {
              const result = await dialog.showOpenDialog(this.mainWindow!, {
                properties: ['openFile']
              });
              if (!result.canceled) {
                this.mainWindow?.webContents.send('menu:open-file', result.filePaths[0]);
              }
            }
          },
          { type: 'separator' },
          {
            label: 'Quit',
            accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Ctrl+Q',
            click: () => {
              app.quit();
            }
          }
        ]
      },
      {
        label: 'Edit',
        submenu: [
          { role: 'undo' },
          { role: 'redo' },
          { type: 'separator' },
          { role: 'cut' },
          { role: 'copy' },
          { role: 'paste' },
          { role: 'selectAll' }
        ]
      },
      {
        label: 'View',
        submenu: [
          { role: 'reload' },
          { role: 'forceReload' },
          { role: 'toggleDevTools' },
          { type: 'separator' },
          { role: 'resetZoom' },
          { role: 'zoomIn' },
          { role: 'zoomOut' },
          { type: 'separator' },
          { role: 'togglefullscreen' }
        ]
      },
      {
        label: 'Voice',
        submenu: [
          {
            label: 'Start Listening',
            accelerator: 'CmdOrCtrl+Space',
            click: () => {
              this.mainWindow?.webContents.send('voice:start-listening');
            }
          },
          {
            label: 'Stop Listening',
            accelerator: 'Escape',
            click: () => {
              this.mainWindow?.webContents.send('voice:stop-listening');
            }
          },
          { type: 'separator' },
          {
            label: 'Voice Settings',
            click: () => {
              this.mainWindow?.webContents.send('menu:voice-settings');
            }
          }
        ]
      },
      {
        label: 'Window',
        submenu: [
          { role: 'minimize' },
          { role: 'close' }
        ]
      },
      {
        label: 'Help',
        submenu: [
          {
            label: 'About Luna Agent',
            click: () => {
              dialog.showMessageBox(this.mainWindow!, {
                type: 'info',
                title: 'About Luna Agent',
                message: 'Luna Agent',
                detail: `Version: ${app.getVersion()}\nProduction-Ready AI Assistant with Voice Interface`
              });
            }
          },
          {
            label: 'Documentation',
            click: () => {
              shell.openExternal('https://docs.luna-agent.com');
            }
          },
          {
            label: 'Report Issue',
            click: () => {
              shell.openExternal('https://github.com/luna-agent/issues');
            }
          }
        ]
      }
    ];

    // macOS specific menu adjustments
    if (process.platform === 'darwin') {
      template.unshift({
        label: app.getName(),
        submenu: [
          { role: 'about' },
          { type: 'separator' },
          { role: 'services' },
          { type: 'separator' },
          { role: 'hide' },
          { role: 'hideOthers' },
          { role: 'unhide' },
          { type: 'separator' },
          { role: 'quit' }
        ]
      });

      // Window menu
      template[5].submenu = [
        { role: 'close' },
        { role: 'minimize' },
        { role: 'zoom' },
        { type: 'separator' },
        { role: 'front' }
      ];
    }

    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);

    logger.info('Application menu configured', 'main-process');
  }

  private async getAudioDevices(): Promise<any[]> {
    // Mock implementation - would integrate with system audio APIs
    return [
      { id: 'default', name: 'Default Microphone', type: 'input' },
      { id: 'default-output', name: 'Default Speakers', type: 'output' }
    ];
  }

  private loadWindowState(): void {
    try {
      const { app } = require('electron');
      const fs = require('fs');
      const statePath = path.join(app.getPath('userData'), 'window-state.json');
      
      if (fs.existsSync(statePath)) {
        const savedState = JSON.parse(fs.readFileSync(statePath, 'utf8'));
        this.windowState = { ...this.windowState, ...savedState };
      }
    } catch (error) {
      logger.warn('Failed to load window state', 'main-process', { error: error instanceof Error ? error.message : 'Unknown error' });
    }
  }

  private saveWindowState(): void {
    try {
      if (!this.mainWindow) return;

      const bounds = this.mainWindow.getBounds();
      this.windowState = {
        ...this.windowState,
        ...bounds,
        isMaximized: this.mainWindow.isMaximized(),
        isFullscreen: this.mainWindow.isFullScreen()
      };

      const { app } = require('electron');
      const fs = require('fs');
      const statePath = path.join(app.getPath('userData'), 'window-state.json');
      
      fs.writeFileSync(statePath, JSON.stringify(this.windowState, null, 2));
    } catch (error) {
      logger.warn('Failed to save window state', 'main-process', { error: error instanceof Error ? error.message : 'Unknown error' });
    }
  }

  private saveWindowBounds(): void {
    if (!this.mainWindow || this.mainWindow.isMaximized() || this.mainWindow.isFullScreen()) {
      return;
    }

    const bounds = this.mainWindow.getBounds();
    this.windowState = { ...this.windowState, ...bounds };
  }

  private notifyRendererOfWindowState(): void {
    if (!this.mainWindow) return;

    this.mainWindow.webContents.send('window:state-changed', {
      isMaximized: this.mainWindow.isMaximized(),
      isFullscreen: this.mainWindow.isFullScreen(),
      bounds: this.mainWindow.getBounds()
    });
  }

  private cleanup(): void {
    if (this.serverProcess) {
      console.log('[Main] Terminating backend server...');
      this.serverProcess.kill('SIGTERM');
      this.serverProcess = null;
      logger.info('Backend server process terminated', 'main-process');
    }

    logger.info('Main process cleanup completed', 'main-process');
  }
}

// Create the main process instance
// The constructor will handle app.whenReady()
console.log('[Main] Creating LunaMainProcess instance...');
const lunaApp = new LunaMainProcess();
console.log('[Main] LunaMainProcess instance created successfully');

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception in main process', error, 'main-process');
  app.quit();
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled rejection in main process', new Error(String(reason)), 'main-process');
});

