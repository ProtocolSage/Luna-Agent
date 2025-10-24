const fs = require("fs");
const path = require("path");

console.log("📦 Copying wake word assets...");

const ASSETS_DIR = path.join(__dirname, "../dist/app/renderer/assets");
const SOURCE_DIR = path.join(__dirname, "../app/renderer/public/assets");

// Create assets directory
if (!fs.existsSync(ASSETS_DIR)) {
  fs.mkdirSync(ASSETS_DIR, { recursive: true });
  console.log("📁 Created assets directory");
}

// Files to copy
const files = [
  "pv_porcupine.wasm",
  "pv_porcupine_simd.wasm",
  "porcupine_worker.js",
  "porcupine_params.pv",
  "Hey-Luna_en_wasm_v3_0_0.ppn",
];

let successCount = 0;
let failCount = 0;

// Check if source directory exists
if (!fs.existsSync(SOURCE_DIR)) {
  console.log(`⚠️  Source directory not found: ${SOURCE_DIR}`);
  console.log("✅ Continuing without wake word assets (app will still work)");
  process.exit(0);
}

console.log(`🔍 Checking source: ${SOURCE_DIR}\n`);

// Copy files from source to dist
files.forEach((file) => {
  const src = path.join(SOURCE_DIR, file);
  const dest = path.join(ASSETS_DIR, file);

  try {
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, dest);
      console.log(`✅ Copied ${file}`);
      successCount++;
    } else {
      console.log(`⚠️  Missing ${file} in source`);
      failCount++;
    }
  } catch (error) {
    console.error(`❌ Failed to copy ${file}:`, error.message);
    failCount++;
  }
});

console.log(`\n📊 Summary: ${successCount} copied, ${failCount} missing`);

if (successCount > 0) {
  console.log("✅ Wake word assets ready!");
} else {
  console.log(
    "⚠️  No assets copied - wake word will be disabled (app works without it)",
  );
}

// Exit successfully - wake word is optional
process.exit(0);
