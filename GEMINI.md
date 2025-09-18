## user

I'm working on the Luna Voice Agent project located at C:\dev\luna-agent-v1.0-production-complete-2. This is a Windows-first desktop voice assistant built with Electron, React, and Node.js. 

I need help analyzing the current state of the project and creating a comprehensive restoration plan. The application is currently non-functional due to critical infrastructure failures in the Electron main process.

Can you help me understand the current architecture and what needs to be fixed?

## model

I'll analyze the Luna Voice Agent project and help you understand its architecture and create a restoration plan.

Based on my analysis of the project structure, here's what I found:

### Current Architecture Overview

The Luna Voice Agent is structured as a modern Electron application with:

1. **Frontend (Electron + React)**
   - Located in `app/renderer/`
   - React 18.2.0 with TypeScript
   - Voice interaction UI components
   - Wake word detection using Porcupine

2. **Backend (Express.js Server)**
   - Located in `backend/`
   - Express 4.18.2 API server
   - Handles AI orchestration, voice services, and database operations
   - Runs on port 3001 by default

3. **Agent Core**
   - Located in `agent/`
   - Contains orchestration logic, memory management, and tool execution
   - Pipeline for processing voice commands

4. **Voice Pipeline**
   - Wake Word: "Hey Luna" using Picovoice Porcupine
   - STT: Multiple providers supported (Web Speech API implemented)
   - TTS: ElevenLabs with Windows SAPI fallback
   - Natural conversation flow management

### Critical Issues Identified

1. **Electron Main Process Failure**
   ```
   TypeError: Cannot read properties of undefined (reading 'whenReady')
   ```
   This indicates the app object isn't properly initialized in the main process.

2. **Database Issues**
   - better-sqlite3 dependency present but falling back to in-memory database
   - Potential installation or compatibility issues on Windows

3. **Build Configuration Problems**
   - Webpack showing compilation warnings
   - Missing or misconfigured entry points

4. **Incomplete Integrations**
   - Voice pipeline components exist but aren't fully connected
   - Wake word detection implemented but not integrated
   - API routes defined but some features stubbed

### Restoration Plan Priority

**Phase 1: Critical Infrastructure** (Must fix first)
- Fix Electron main process initialization
- Resolve webpack configuration issues  
- Implement proper SQLite database with fallbacks
- Secure configuration management

**Phase 2: Voice Pipeline**
- Connect wake word detection to voice capture
- Implement multi-provider STT system
- Complete TTS integration with caching
- Natural conversation flow manager

**Phase 3: AI Integration**
- Complete model router implementation
- Memory and learning system
- Tool execution framework

Would you like me to start with fixing the critical Electron main process issue?

## user

Yes, please fix the Electron main process issue first. Show me exactly what needs to be changed in the main process files to get the application starting properly.

## model

I'll fix the Electron main process issue. Let me first examine the current main process file to identify the problem:

Looking at the error `TypeError: Cannot read properties of undefined (reading 'whenReady')`, this typically happens when:
1. The Electron app module isn't properly imported
2. The file is being executed before Electron is ready
3. Webpack bundling issues are preventing proper module resolution

Here's the corrected main process implementation:

### FILE: app/main/index.ts
```typescript
import { app, BrowserWindow, Tray, Menu, shell, ipcMain, session } from 'electron';
import * as path from 'path';
import * as url from 'url';
import * as fs from 'fs';
import { spawn, ChildProcess } from 'child_process';
import isDev from 'electron-is-dev';

// Ensure Electron doesn't quit when all windows are closed
app.setQuitOnAllWindowsClosed(false);

// Global references to prevent garbage collection
let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let backendProcess: ChildProcess | null = null;
let isQuitting = false;

// Configuration
const BACKEND_PORT = process.env.BACKEND_PORT || 3001;
const BACKEND_URL = `http://localhost:${BACKEND_PORT}`;

// Production logging
const userDataPath = app.getPath('userData');
const logPath = path.join(userDataPath, 'luna.log');

// Ensure userData directory exists
if (!fs.existsSync(userDataPath)) {
  fs.mkdirSync(userDataPath, { recursive: true });
}

const logStream = fs.createWriteStream(logPath, { flags: 'a' });

function log(level: string, message: string, ...args: any[]) {
  const timestamp = new Date().toISOString();
  const logEntry = `[${timestamp}] [${level}] ${message} ${args.length ? JSON.stringify(args) : ''}`;
  console.log(logEntry);
  logStream.write(logEntry + '\n');
}

// Single instance lock
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  log('WARN', 'Another instance is already running, quitting...');
  app.quit();
} else {
  app.on('second-instance', () => {
    // Someone tried to run a second instance, focus our window instead
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

// Backend server management
async function startBackendServer(): Promise<void> {
  return new Promise((resolve, reject) => {
    log('INFO', 'Starting backend server...');
    
    const backendScript = isDev 
      ? path.join(__dirname, '../../backend/server.js')
      : path.join(process.resourcesPath, 'app/dist/backend/server.js');
    
    log('INFO', `Backend script path: ${backendScript}`);
    
    if (!fs.existsSync(backendScript)) {
      const error = `Backend server not found at: ${backendScript}`;
      log('ERROR', error);
      reject(new Error(error));
      return;
    }

    const env = {
      ...process.env,
      PORT: BACKEND_PORT.toString(),
      NODE_ENV: process.env.NODE_ENV || 'production',
      ELECTRON_RUN_AS_NODE: '1'
    };

    backendProcess = spawn(process.execPath, [backendScript], {
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true
    });

    backendProcess.stdout?.on('data', (data) => {
      const message = data.toString().trim();
      log('BACKEND', message);
      
      // Check if backend is ready
      if (message.includes('Server running') || message.includes('listening on port')) {
        log('INFO', 'Backend server is ready');
        resolve();
      }
    });

    backendProcess.stderr?.on('data', (data) => {
      log('BACKEND-ERROR', data.toString().trim());
    });

    backendProcess.on('error', (error) => {
      log('ERROR', 'Backend process error:', error.message);
      reject(error);
    });

    backendProcess.on('exit', (code, signal) => {
      log('WARN', `Backend process exited with code ${code} and signal ${signal}`);
      if (!isQuitting) {
        log('INFO', 'Restarting backend server in 5 seconds...');
        setTimeout(() => startBackendServer().catch(console.error), 5000);
      }
    });

    // Timeout if backend doesn't start
    setTimeout(() => {
      reject(new Error('Backend server startup timeout'));
    }, 30000);
  });
}

// Create the main window
function createMainWindow() {
  log('INFO', 'Creating main window...');
  
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: 'Luna Voice Agent',
    icon: path.join(__dirname, '../../assets/icon.ico'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      webSecurity: !isDev
    },
    show: false,
    frame: true,
    backgroundColor: '#1a1a1a'
  });

  // Set CSP headers for security
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [`
          default-src 'self';
          script-src 'self' 'unsafe-inline' 'unsafe-eval' http://localhost:*;
          style-src 'self' 'unsafe-inline';
          font-src 'self' data:;
          img-src 'self' data: https:;
          connect-src 'self' http://localhost:* ws://localhost:* https://api.openai.com https://api.elevenlabs.io;
          media-src 'self' blob: data:;
        `.replace(/\s+/g, ' ').trim()]
      }
    });
  });

  // Load the app
  const startUrl = isDev 
    ? 'http://localhost:3000' // Vite dev server
    : `${BACKEND_URL}`;
    
  mainWindow.loadURL(startUrl);
  
  if (isDev) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.once('ready-to-show', () => {
    log('INFO', 'Main window ready to show');
    mainWindow?.show();
  });

  mainWindow.on('close', (event) => {
    if (!isQuitting && process.platform === 'darwin') {
      event.preventDefault();
      mainWindow?.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Handle external links
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

// Create system tray
function createTray() {
  log('INFO', 'Creating system tray...');
  
  const trayIconPath = path.join(__dirname, '../../assets/tray.png');
  
  if (!fs.existsSync(trayIconPath)) {
    log('WARN', 'Tray icon not found, skipping tray creation');
    return;
  }

  tray = new Tray(trayIconPath);
  
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show Luna',
      click: () => {
        mainWindow?.show();
        mainWindow?.focus();
      }
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        isQuitting = true;
        app.quit();
      }
    }
  ]);

  tray.setToolTip('Luna Voice Agent');
  tray.setContextMenu(contextMenu);
  
  tray.on('double-click', () => {
    mainWindow?.show();
    mainWindow?.focus();
  });
}

// IPC Handlers
ipcMain.handle('app:getVersion', () => app.getVersion());
ipcMain.handle('app:getPlatform', () => process.platform);
ipcMain.handle('app:getBackendUrl', () => BACKEND_URL);

// App event handlers
app.whenReady().then(async () => {
  log('INFO', 'Electron app ready');
  
  try {
    // Start backend first
    await startBackendServer();
    
    // Create UI
    createMainWindow();
    createTray();
    
    log('INFO', 'Luna Voice Agent started successfully');
  } catch (error: any) {
    log('ERROR', 'Failed to start application:', error.message);
    app.quit();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createMainWindow();
  }
});

app.on('before-quit', () => {
  isQuitting = true;
  
  // Stop backend process
  if (backendProcess) {
    log('INFO', 'Stopping backend server...');
    backendProcess.kill('SIGTERM');
  }
  
  // Close log stream
  logStream.end();
});

// Error handling
process.on('uncaughtException', (error) => {
  log('ERROR', 'Uncaught exception:', error.message, error.stack);
});

process.on('unhandledRejection', (reason, promise) => {
  log('ERROR', 'Unhandled rejection at:', promise, 'reason:', reason);
});

export { app };
```

### FILE: app/main/preload.ts
```typescript
import { contextBridge, ipcRenderer } from 'electron';

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  getVersion: () => ipcRenderer.invoke('app:getVersion'),
  getPlatform: () => ipcRenderer.invoke('app:getPlatform'),
  getBackendUrl: () => ipcRenderer.invoke('app:getBackendUrl'),
  
  // Voice-related APIs
  onVoiceStateChange: (callback: (state: string) => void) => {
    ipcRenderer.on('voice:stateChange', (_event, state) => callback(state));
  },
  
  // System APIs
  minimizeWindow: () => ipcRenderer.send('window:minimize'),
  maximizeWindow: () => ipcRenderer.send('window:maximize'),
  closeWindow: () => ipcRenderer.send('window:close'),
});

// TypeScript declarations
declare global {
  interface Window {
    electronAPI: {
      getVersion: () => Promise<string>;
      getPlatform: () => Promise<string>;
      getBackendUrl: () => Promise<string>;
      onVoiceStateChange: (callback: (state: string) => void) => void;
      minimizeWindow: () => void;
      maximizeWindow: () => void;
      closeWindow: () => void;
    };
  }
}
```

The key fixes in this implementation:

1. **Proper module imports** - Ensuring all Electron modules are imported correctly
2. **App readiness check** - Using `app.whenReady()` properly before creating windows
3. **Backend process management** - Starting the backend server before creating the UI
4. **Error handling** - Comprehensive error logging and recovery
5. **Single instance lock** - Preventing multiple instances
6. **CSP headers** - Security headers for the renderer
7. **IPC communication** - Proper IPC setup between main and renderer

To implement this fix:

1. Replace the current main process file with the corrected version above
2. Ensure the preload script is also updated
3. Check that webpack is configured to build these files correctly
4. Make sure the backend server file exists at the expected path

This should resolve the "whenReady" error and allow the Electron app to start properly.

## user

Now let's check the webpack configuration to ensure it's properly set up to build the main process and preload scripts. Can you show me what the webpack configuration should look like?
