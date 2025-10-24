// Test script to understand electron module loading
console.log("[Test] process.versions.electron:", process.versions.electron);
console.log("[Test] process.type:", process.type);

const electron = require("electron");
console.log("[Test] typeof electron:", typeof electron);
console.log(
  "[Test] electron has app?:",
  electron && electron.app ? "YES" : "NO",
);

if (electron && electron.app) {
  console.log("[Test] SUCCESS: Electron API loaded!");
} else {
  console.log("[Test] FAIL: Got path string instead of API");
}
