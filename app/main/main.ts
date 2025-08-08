// Polyfill File API FIRST - before any other imports
if (typeof globalThis.File === 'undefined') {
  const { Blob } = require('buffer');
  
  class File extends Blob {
    public name: string;
    public lastModified: number;
    public lastModifiedDate: Date;
    
    constructor(chunks: any[], filename: string, options: any = {}) {
      const parts = Array.isArray(chunks) ? chunks : [chunks];
      const normalizedParts = parts.map((part: any) => {
        if (part instanceof Buffer) return part;
        if (part instanceof ArrayBuffer) return Buffer.from(part);
        if (part instanceof Uint8Array) return Buffer.from(part);
        if (typeof part === 'string') return part;
        if (part && typeof part.toString === 'function') return part.toString();
        return String(part);
      });
      
      super(normalizedParts, options);
      this.name = String(filename);
      this.lastModified = options.lastModified || Date.now();
      this.lastModifiedDate = new Date(this.lastModified);
    }
  }
  
  globalThis.File = File;
  global.File = File;
}

// Now load the rest of the application
import { app, BrowserWindow } from 'electron';
import * as path from 'path';
import VoiceHandler from './voiceHandler';

let mainWindow: BrowserWindow | null = null;
let serverInstance: any = null;
let voiceHandler: VoiceHandler | null = null;
// Lazy load the server to ensure File polyfill is in place
async function getServer() {
  if (!serverInstance) {
    const { server } = await import('../../backend/server');
    serverInstance = await server;
  }
  return serverInstance;
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,  // Security: Keep this false
      contextIsolation: true,   // Security: Keep this true
      preload: path.join(__dirname, 'preload.js'),
      sandbox: false           // Disabled to allow IPC access
    },
    titleBarStyle: 'hiddenInset',
    vibrancy: 'under-window',
    show: false
  });

  const isDev = process.env.NODE_ENV === 'development';
  
  if (isDev) {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }
  mainWindow.once('ready-to-show', () => {
    if (mainWindow) {
      mainWindow.show();
      // Initialize voice handler after window is shown
      voiceHandler = new VoiceHandler(mainWindow);
      console.log('Voice handler initialized');
    }
  });

  mainWindow.on('closed', () => {
    // Cleanup voice handler
    if (voiceHandler) {
      voiceHandler.destroy();
      voiceHandler = null;
    }
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  createWindow();
  
  // Initialize server instance for proper cleanup
  try {
    serverInstance = await getServer();
    console.log('Backend server initialized successfully');
  } catch (error) {
    console.error('Failed to initialize backend server:', error);
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  // Graceful shutdown: Close backend server before Electron app quits
  if (serverInstance && typeof serverInstance.close === 'function') {
    console.log('Shutting down backend server...');
    serverInstance.close();
  }
});