// Simple Electron main process without webpack complications
const {
  app,
  BrowserWindow,
  ipcMain,
  shell,
  dialog,
  Menu,
  globalShortcut,
} = require("electron");
const path = require("path");

console.log("[Main] Simple Electron main process starting...");
console.log("[Main] Electron version:", process.versions.electron);

// Load environment variables
try {
  require("dotenv").config({ path: path.resolve(__dirname, "../../../.env") });
  console.log("[Main] Environment variables loaded");
} catch (error) {
  console.warn("[Main] Failed to load .env file:", error.message);
}

class LunaMainProcess {
  constructor() {
    this.mainWindow = null;
    this.isDevelopment = process.env.NODE_ENV === "development";
    this.windowState = {
      width: 1400,
      height: 900,
      isMaximized: false,
      isFullscreen: false,
    };

    this.setupApp();
    this.registerIpcHandlers();
  }

  setupApp() {
    // Security: Enable sandbox
    if (app && typeof app.enableSandbox === "function") {
      app.enableSandbox();
    }

    // App ready handler
    app.whenReady().then(() => {
      console.log("[Main] App ready, creating main window...");
      this.createMainWindow();
      this.setupApplicationMenu();
    });

    // App event handlers
    app.on("window-all-closed", () => {
      console.log("[Main] All windows closed");
      if (process.platform !== "darwin") {
        app.quit();
      }
    });

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        this.createMainWindow();
      }
    });

    console.log("[Main] App setup completed");
  }

  createMainWindow() {
    console.log("[Main] Creating main window...");

    this.mainWindow = new BrowserWindow({
      width: this.windowState.width,
      height: this.windowState.height,
      minWidth: 800,
      minHeight: 600,
      show: false,
      title: "Luna Agent - Production AI Assistant",
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        preload: path.join(__dirname, "../../dist/app/preload/preload.js"),
        webSecurity: true,
        allowRunningInsecureContent: false,
      },
    });

    // Load the renderer
    const apiBase = process.env.LUNA_API_BASE || "http://localhost:3000";
    const rendererPath = path.join(
      __dirname,
      "../../dist/app/renderer/index.html",
    );

    console.log("[Main] Loading renderer from:", rendererPath);
    console.log("[Main] API Base:", apiBase);

    this.mainWindow.loadFile(rendererPath, {
      query: { apiBase },
    });

    // Open dev tools in development
    if (this.isDevelopment) {
      this.mainWindow.webContents.openDevTools();
    }

    // Show window when ready
    this.mainWindow.once("ready-to-show", () => {
      console.log("[Main] Window ready to show");
      this.mainWindow.show();
      this.mainWindow.focus();
    });

    this.mainWindow.on("closed", () => {
      this.mainWindow = null;
    });

    console.log("[Main] Main window created successfully");
  }

  registerIpcHandlers() {
    // Basic window controls
    ipcMain.handle("window:minimize", () => {
      this.mainWindow?.minimize();
    });

    ipcMain.handle("window:maximize", () => {
      if (this.mainWindow?.isMaximized()) {
        this.mainWindow.unmaximize();
      } else {
        this.mainWindow?.maximize();
      }
    });

    ipcMain.handle("window:close", () => {
      this.mainWindow?.close();
    });

    // System info
    ipcMain.handle("system:get-info", () => {
      return {
        platform: process.platform,
        arch: process.arch,
        version: process.version,
        electronVersion: process.versions.electron,
        appVersion: app.getVersion(),
      };
    });

    console.log("[Main] IPC handlers registered");
  }

  setupApplicationMenu() {
    const template = [
      {
        label: "File",
        submenu: [
          {
            label: "Quit",
            accelerator: process.platform === "darwin" ? "Cmd+Q" : "Ctrl+Q",
            click: () => app.quit(),
          },
        ],
      },
      {
        label: "View",
        submenu: [
          { role: "reload" },
          { role: "forceReload" },
          { role: "toggleDevTools" },
          { type: "separator" },
          { role: "resetZoom" },
          { role: "zoomIn" },
          { role: "zoomOut" },
          { type: "separator" },
          { role: "togglefullscreen" },
        ],
      },
    ];

    if (process.platform === "darwin") {
      template.unshift({
        label: app.getName(),
        submenu: [{ role: "about" }, { type: "separator" }, { role: "quit" }],
      });
    }

    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
    console.log("[Main] Application menu configured");
  }
}

// Initialize the application
console.log("[Main] Initializing Luna Agent...");
const lunaApp = new LunaMainProcess();

// Error handling
process.on("uncaughtException", (error) => {
  console.error("[Main] Uncaught exception:", error);
  app.quit();
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("[Main] Unhandled rejection:", reason);
});

console.log("[Main] Main process initialized successfully");
