import { app, BrowserWindow } from 'electron';
import * as path from 'path';
import { server as serverPromise } from '../../backend/server';

let mainWindow: BrowserWindow | null = null;
let serverInstance: any = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
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
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  createWindow();
  
  // Initialize server instance for proper cleanup
  try {
    serverInstance = await serverPromise;
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

