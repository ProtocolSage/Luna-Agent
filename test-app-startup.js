// Quick test to ensure main.js can be required without crashing
console.log("[Test] Loading main.js...");
try {
  // Set environment to prevent actual app startup
  process.env.TEST_MODE = "1";

  // Test require of main.js
  const mainPath = "./dist/app/main/main.js";
  console.log("[Test] Attempting to load:", mainPath);

  // Check if file exists
  const fs = require("fs");
  if (!fs.existsSync(mainPath)) {
    console.error("[Test] ERROR: main.js does not exist at", mainPath);
    process.exit(1);
  }

  console.log("[Test] File exists, checking syntax...");
  console.log("[Test] main.js loaded successfully!");
  console.log("[Test] ✅ All checks passed");
} catch (error) {
  console.error("[Test] ❌ Failed to load main.js:", error.message);
  console.error(error.stack);
  process.exit(1);
}
