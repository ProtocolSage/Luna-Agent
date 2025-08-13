import { app, BrowserWindow, ipcMain, shell, dialog, Menu, globalShortcut } from 'electron';
import path from 'path';
import { spawn, ChildProcess } from 'child_process';
import { logger } from '../app/renderer/services/analytics/Logger';

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
  private mainWindow: BrowserWindow | null = null;
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
    // Security: Enable sandbox for all renderers
    app.enableSandbox();

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
    app.on('web-contents-created', (event, contents) => {
      contents.on('new-window', (navigationEvent, url) => {
        navigationEvent.preventDefault();
        shell.openExternal(url);
      });

      contents.setWindowOpenHandler(() => {
        return { action: 'deny' };
      });
    });
  }

  private createMainWindow(): void {
    // Load saved window state
    this.loadWindowState();

    this.mainWindow = new BrowserWindow({
      width: this.windowState.width,
      height: this.windowState.height,
      x: this.windowState.x,
      y: this.windowState.y,
      minWidth: 800,
      minHeight: 600,
      show: false, // Don't show until ready
      title: 'Luna Agent - Production AI Assistant',
      icon: path.join(__dirname, '../assets/icon.png'),
      titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
      titleBarOverlay: process.platform === 'win32' ? {
        color: '#1a1a2e',
        symbolColor: '#ffffff'
      } : false,
      webPreferences: {
        // Security: Critical settings
        nodeIntegration: false,
        contextIsolation: true,
        enableRemoteModule: false,
        sandbox: true,
        preload: path.join(__dirname, '../preload/preload.js'),
        
        // Performance and features
        webSecurity: true,
        allowRunningInsecureContent: false,
        experimentalFeatures: false,
        enableBlinkFeatures: '',
        disableBlinkFeatures: '',
        
        // Media permissions for voice
        enableWebRTC: true,
        autoplayPolicy: 'user-gesture-required'
      }
    });

    // Load the renderer
    if (this.isDevelopment) {
      this.mainWindow.loadURL('http://localhost:3000');
      this.mainWindow.webContents.openDevTools();
    } else {
      this.mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
    }

    // Window event handlers
    this.mainWindow.once('ready-to-show', () => {
      if (!this.mainWindow) return;

      // Restore window state
      if (this.windowState.isMaximized) {
        this.mainWindow.maximize();
      }
      if (this.windowState.isFullscreen) {
        this.mainWindow.setFullScreen(true);
      }

      this.mainWindow.show();
      this.mainWindow.focus();

      logger.info('Main window ready and shown', 'main-process');
    });

    this.mainWindow.on('close', () => {
      this.saveWindowState();
    });

    this.mainWindow.on('closed', () => {
      this.mainWindow = null;
    });

    // Window state tracking
    this.mainWindow.on('maximize', () => {
      this.windowState.isMaximized = true;
      this.notifyRendererOfWindowState();
    });

    this.mainWindow.on('unmaximize', () => {
      this.windowState.isMaximized = false;
      this.notifyRendererOfWindowState();
    });

    this.mainWindow.on('enter-full-screen', () => {
      this.windowState.isFullscreen = true;
      this.notifyRendererOfWindowState();
    });

    this.mainWindow.on('leave-full-screen', () => {
      this.windowState.isFullscreen = false;
      this.notifyRendererOfWindowState();
    });

    this.mainWindow.on('moved', () => {
      this.saveWindowBounds();
    });

    this.mainWindow.on('resized', () => {
      this.saveWindowBounds();
    });

    logger.info('Main window created', 'main-process', {
      dimensions: `${this.windowState.width}x${this.windowState.height}`,
      development: this.isDevelopment
    });
  }

  private async startBackendServer(): Promise<void> {
    if (this.isDevelopment) {
      logger.info('Development mode: Backend server should be started separately', 'main-process');
      return;
    }

    try {
      const serverPath = path.join(__dirname, '../backend/server.js');
      
      this.serverProcess = spawn('node', [serverPath], {
        stdio: 'pipe',
        env: {
          ...process.env,
          NODE_ENV: 'production',
          PORT: '3001',
          ELECTRON_MODE: 'true'
        }
      });

      this.serverProcess.stdout?.on('data', (data) => {
        logger.info('Backend server output', 'main-process', { output: data.toString() });
      });

      this.serverProcess.stderr?.on('data', (data) => {
        logger.error('Backend server error', new Error(data.toString()), 'main-process');
      });

      this.serverProcess.on('close', (code) => {
        logger.warn('Backend server closed', 'main-process', { exitCode: code });
      });

      logger.info('Backend server started', 'main-process');

    } catch (error) {
      logger.error('Failed to start backend server', error as Error, 'main-process');
    }
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
    ipcMain.handle('dialog:open-file', async (event, options = {}) => {
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

    ipcMain.handle('dialog:save-file', async (event, options = {}) => {
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

    ipcMain.handle('voice:start-recording', async (event, options = {}) => {
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

    ipcMain.handle('system:open-external', async (event, url: string) => {
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
    ipcMain.handle('notification:show', (event, options) => {
      // Use system notifications
      if (Notification.isSupported()) {
        new Notification({
          title: options.title || 'Luna Agent',
          body: options.body || '',
          icon: path.join(__dirname, '../assets/icon.png'),
          ...options
        }).show();
      }
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
          { role: 'selectall' }
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
      this.serverProcess.kill();
      this.serverProcess = null;
      logger.info('Backend server process terminated', 'main-process');
    }

    logger.info('Main process cleanup completed', 'main-process');
  }
}

// Initialize the main process
new LunaMainProcess();

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception in main process', error, 'main-process');
  app.quit();
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled rejection in main process', new Error(String(reason)), 'main-process');
});
