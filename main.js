/**
 * Luna Agent - Electron Main Process Entry Point
 * Pure JavaScript entry point to avoid module loading issues
 */

// CRITICAL: Remove ELECTRON_RUN_AS_NODE immediately - this forces Electron to run as Node.js
// instead of in proper Electron mode, which breaks require('electron')
if (process.env.ELECTRON_RUN_AS_NODE === '1') {
  console.log('[Main] WARNING: ELECTRON_RUN_AS_NODE was set, deleting it...');
  delete process.env.ELECTRON_RUN_AS_NODE;
}

const path = require('path');
const { spawn } = require('child_process');

// DO NOT require electron here - it will be a string
// Wait until the bottom of the file after all definitions

console.log('[Main] Luna Agent starting...');
console.log('[Main] Node version:', process.versions.node);
console.log('[Main] pwd:', process.cwd());

// Load environment variables
try {
  require('dotenv').config({ path: path.resolve(__dirname, '.env') });
  console.log('[Main] Environment variables loaded');
} catch (error) {
  console.warn('[Main] Failed to load .env file:', error.message);
}

let mainWindow = null;
let serverProcess = null;
const isDevelopment = process.env.NODE_ENV === 'development';

let windowState = {
  width: 1400,
  height: 900,
  isMaximized: false
};

// Keep all your functions BUT remove electron API calls from them
// We'll inject electron as a parameter

function createMainWindow(electron) {
  const { BrowserWindow } = electron;
  console.log('[Main] Creating main window...');

  mainWindow = new BrowserWindow({
    width: windowState.width,
    height: windowState.height,
    minWidth: 800,
    minHeight: 600,
    show: false,
    title: 'Luna Agent - AI Assistant',
    backgroundColor: '#1a1a2e',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      preload: path.join(__dirname, 'dist', 'app', 'main', 'preload.js'),
      webSecurity: true,
      allowRunningInsecureContent: false,
      autoplayPolicy: 'no-user-gesture-required'
    }
  });

  const apiBase = process.env.API_BASE || 'http://localhost:3001';
  const rendererPath = path.join(__dirname, 'dist', 'app', 'renderer', 'index.html');

  mainWindow.loadFile(rendererPath, { query: { apiBase } });

  if (isDevelopment) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.once('ready-to-show', () => {
    console.log('[Main] Window ready to show');
    if (windowState.isMaximized) {
      mainWindow.maximize();
    }
    mainWindow.show();
    mainWindow.focus();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

async function startBackendServer() {
  if (isDevelopment) {
    console.log('[Main] Development mode - backend should be started externally');
    return;
  }

  const serverPath = path.join(__dirname, 'dist', 'backend', 'server.js');
  console.log('[Main] Starting backend server:', serverPath);

  serverProcess = spawn('node', [serverPath], {
    env: { ...process.env, PORT: '3001' },
    stdio: 'pipe'
  });

  if (serverProcess.stdout) {
    serverProcess.stdout.on('data', (data) => console.log(`[Backend] ${data}`));
  }

  if (serverProcess.stderr) {
    serverProcess.stderr.on('data', (data) => console.error(`[Backend] ${data}`));
  }

  await new Promise(resolve => setTimeout(resolve, 3000));
}

function setupIpcHandlers(electron) {
  const { ipcMain, shell, dialog } = electron;

  ipcMain.handle('window:minimize', () => mainWindow?.minimize());
  ipcMain.handle('window:maximize', () => {
    if (mainWindow?.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow?.maximize();
    }
  });
  ipcMain.handle('window:close', () => mainWindow?.close());

  ipcMain.handle('system:get-info', () => ({
    platform: process.platform,
    arch: process.arch,
    version: process.version,
    electronVersion: process.versions.electron
  }));

  ipcMain.handle('system:open-external', async (event, url) => {
    try {
      await shell.openExternal(url);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // STT (Speech-to-Text) handlers - renderer handles actual STT
  ipcMain.handle('stt:start', async () => {
    return { success: true };
  });

  ipcMain.handle('stt:stop', async () => {
    return { success: true };
  });

  ipcMain.handle('stt:get-status', async () => {
    return {
      isListening: false,
      currentProvider: 'webSpeech',
      providers: ['webSpeech', 'whisper'],
      supported: true
    };
  });

  ipcMain.handle('stt:switch-to-cloud', async () => {
    return { success: true };
  });

  ipcMain.handle('stt:switch-to-whisper', async () => {
    return { success: true };
  });

  ipcMain.handle('stt:health-check', async () => {
    return {
      status: 'ok',
      webSpeech: true,
      whisper: true,
      timestamp: new Date().toISOString()
    };
  });

  console.log('[Main] IPC handlers registered');
}

function setupApplicationMenu(electron) {
  const { Menu, dialog, app } = electron;

  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'New Conversation',
          accelerator: 'CmdOrCtrl+N',
          click: () => mainWindow?.webContents.send('menu:new-conversation')
        },
        { type: 'separator' },
        {
          label: 'Quit',
          accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Ctrl+Q',
          click: () => app.quit()
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
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

function cleanup() {
  if (serverProcess) {
    console.log('[Main] Terminating backend server...');
    serverProcess.kill('SIGTERM');
    serverProcess = null;
  }
}

// NOW require electron at the bottom after all code is defined
console.log('[Main] About to require electron...');
console.log('[Main] process.type:', process.type);
console.log('[Main] process.versions.electron:', process.versions.electron);
console.log('[Main] process.versions.chrome:', process.versions.chrome);

const electron = require('electron');
console.log('[Main] typeof electron:', typeof electron);
console.log('[Main] electron value:', typeof electron === 'string' ? electron.substring(0, 100) : 'object');

if (typeof electron === 'string') {
  console.error('[Main] FATAL: electron is still a string even at bottom of file!');
  console.error('[Main] This indicates Electron is not running in the proper process context.');
  console.error('[Main] Check if electron.exe is actually launching this script.');
  process.exit(1);
}

const { app, BrowserWindow } = electron;

console.log('[Main] Electron version:', process.versions.electron);
console.log('[Main] Electron loaded successfully');

app.whenReady().then(async () => {
  console.log('[Main] App ready, initializing...');
  setupIpcHandlers(electron);
  setupApplicationMenu(electron);
  await startBackendServer();
  createMainWindow(electron);
  console.log('[Main] Luna Agent initialized successfully');
});

app.on('window-all-closed', () => {
  cleanup();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createMainWindow(electron);
  }
});

app.on('before-quit', cleanup);

process.on('uncaughtException', (error) => {
  console.error('[Main] Uncaught exception:', error);
});

process.on('unhandledRejection', (reason) => {
  console.error('[Main] Unhandled rejection:', reason);
});
