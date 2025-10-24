// Test script to verify Electron app can load and render correctly
const { app, BrowserWindow } = require("electron");
const path = require("path");

let testWindow;

app.whenReady().then(() => {
  testWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      preload: path.join(__dirname, "../dist/app/preload/preload.js"),
    },
  });

  testWindow.loadFile(path.join(__dirname, "../dist/app/renderer/index.html"));

  // Open DevTools to see any errors
  testWindow.webContents.openDevTools();

  // Log when page loads successfully
  testWindow.webContents.on("did-finish-load", () => {
    console.log("✅ Page loaded successfully!");

    // Check if React rendered
    testWindow.webContents
      .executeJavaScript(
        `
      const rootElement = document.getElementById('root');
      const hasContent = rootElement && rootElement.children.length > 0;
      console.log('React rendered:', hasContent);
      hasContent;
    `,
      )
      .then((result) => {
        console.log("✅ React app rendered:", result);
      });

    // Check for window.lunaAPI
    testWindow.webContents
      .executeJavaScript(
        `
      console.log('window.lunaAPI available:', typeof window.lunaAPI !== 'undefined');
      typeof window.lunaAPI !== 'undefined';
    `,
      )
      .then((result) => {
        console.log("✅ Preload API available:", result);
      });
  });

  // Log any console messages
  testWindow.webContents.on(
    "console-message",
    (event, level, message, line, sourceId) => {
      if (level >= 2) {
        // Error or warning
        console.log(`[Console ${level}] ${message}`);
      }
    },
  );
});

app.on("window-all-closed", () => {
  app.quit();
});
