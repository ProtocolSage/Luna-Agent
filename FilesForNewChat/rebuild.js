const { execSync } = require("child_process");
const path = require("path");

console.log("🔧 Rebuilding native modules for Electron...");

try {
  const pkg = require("../package.json");
  const electronVersion = pkg.devDependencies.electron.replace(/[\^~]/, "");

  console.log(`📦 Target: Electron ${electronVersion}`);
  console.log(`🏗️  Platform: ${process.platform} ${process.arch}`);

  execSync(`npx electron-rebuild -f -w better-sqlite3 -v ${electronVersion}`, {
    stdio: "inherit",
    cwd: path.resolve(__dirname, ".."),
  });

  console.log("✅ Native modules rebuilt successfully");
} catch (error) {
  console.error("❌ Rebuild failed:", error.message);
  console.log("\n💡 Troubleshooting:");
  console.log("  1. Ensure Visual Studio Build Tools are installed");
  console.log("  2. Run: npm install --global windows-build-tools");
  console.log("  3. Try: npm install better-sqlite3 --build-from-source");
  process.exit(1);
}
