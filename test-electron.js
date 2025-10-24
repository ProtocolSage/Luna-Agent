console.log("Testing Electron import...");

try {
  const electron = require("electron");
  console.log("Electron object type:", typeof electron);
  console.log("Electron object keys:", Object.keys(electron));
  console.log("Has app?", "app" in electron);
  console.log("App type:", typeof electron.app);

  if (electron.app) {
    console.log("✅ Electron app loaded successfully");
    console.log("App version:", electron.app.getVersion());

    electron.app.whenReady().then(() => {
      console.log("✅ Electron app is ready");
      electron.app.quit();
    });
  } else {
    console.log("❌ Electron app is undefined");
    console.log("Full electron object:", electron);
  }
} catch (error) {
  console.error("❌ Failed to require electron:", error);
}
