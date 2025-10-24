const fs = require("fs");
const path = require("path");

console.log("📦 Extracting Porcupine assets from node_modules...\n");

// Define source locations to check
const POSSIBLE_WORKER_SOURCES = [
  "node_modules/@picovoice/porcupine-web/dist/iife/index.js",
  "node_modules/@picovoice/porcupine-web/dist/esm/index.js",
  "node_modules/@picovoice/porcupine-web/lib/porcupine_worker.js",
];

const ASSETS_TO_FIND = {
  "porcupine_worker.js": POSSIBLE_WORKER_SOURCES,
};

// Target directories
const DIST_ASSETS_DIR = path.join(
  __dirname,
  "..",
  "dist",
  "app",
  "renderer",
  "assets",
);
const PUBLIC_ASSETS_DIR = path.join(
  __dirname,
  "..",
  "app",
  "renderer",
  "public",
  "assets",
);

// Create directories if they don't exist
[DIST_ASSETS_DIR, PUBLIC_ASSETS_DIR].forEach((dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`✅ Created directory: ${dir}`);
  }
});

// Function to extract embedded base64 WASM from worker file
function extractWasmFromWorker(workerPath) {
  try {
    const content = fs.readFileSync(workerPath, "utf8");

    // Look for base64 encoded WASM data
    const wasmBase64Pattern =
      /const\s+wasmBase64\s*=\s*["']([A-Za-z0-9+/=]+)["']/;
    const match = content.match(wasmBase64Pattern);

    if (match && match[1]) {
      console.log("✅ Found embedded WASM data in worker file");
      const wasmBuffer = Buffer.from(match[1], "base64");

      // Save the WASM file
      const wasmPath = path.join(DIST_ASSETS_DIR, "pv_porcupine.wasm");
      fs.writeFileSync(wasmPath, wasmBuffer);
      fs.writeFileSync(
        path.join(PUBLIC_ASSETS_DIR, "pv_porcupine.wasm"),
        wasmBuffer,
      );
      console.log("✅ Extracted pv_porcupine.wasm");

      return true;
    }

    return false;
  } catch (error) {
    console.log(`⚠️  Could not extract WASM from worker: ${error.message}`);
    return false;
  }
}

// Extract assets
let foundWorker = false;
let foundWasm = false;

// Find and copy worker file
for (const [assetName, sources] of Object.entries(ASSETS_TO_FIND)) {
  for (const sourcePath of sources) {
    const fullPath = path.join(__dirname, "..", sourcePath);
    if (fs.existsSync(fullPath)) {
      console.log(`✅ Found ${assetName} at ${sourcePath}`);

      // Copy to both directories
      const content = fs.readFileSync(fullPath);
      fs.writeFileSync(path.join(DIST_ASSETS_DIR, assetName), content);
      fs.writeFileSync(path.join(PUBLIC_ASSETS_DIR, assetName), content);

      foundWorker = true;

      // Try to extract WASM from worker
      foundWasm = extractWasmFromWorker(fullPath);
      break;
    }
  }
}

// Create placeholder WASM files if not found
if (!foundWasm) {
  console.log("\n⚠️  WASM files not found in package - creating placeholders");
  console.log("   You'll need to download these from Picovoice Console\n");

  const placeholderWasm = Buffer.from("PLACEHOLDER_WASM_FILE");

  ["pv_porcupine.wasm", "pv_porcupine_simd.wasm"].forEach((filename) => {
    fs.writeFileSync(path.join(DIST_ASSETS_DIR, filename), placeholderWasm);
    fs.writeFileSync(path.join(PUBLIC_ASSETS_DIR, filename), placeholderWasm);
    console.log(`   - Created placeholder: ${filename}`);
  });
}

// Create placeholder porcupine_params.pv file
const paramsFile = "porcupine_params.pv";
if (!fs.existsSync(path.join(DIST_ASSETS_DIR, paramsFile))) {
  const placeholderParams = Buffer.from("PLACEHOLDER_PARAMS_FILE");
  fs.writeFileSync(path.join(DIST_ASSETS_DIR, paramsFile), placeholderParams);
  fs.writeFileSync(path.join(PUBLIC_ASSETS_DIR, paramsFile), placeholderParams);
  console.log(`   - Created placeholder: ${paramsFile}`);
}

// Create a wake word keyword file placeholder
const keywordFile = "Hey-Luna_en_wasm_v3_0_0.ppn";
if (!fs.existsSync(path.join(DIST_ASSETS_DIR, keywordFile))) {
  const placeholderKeyword = Buffer.from("PLACEHOLDER_KEYWORD_FILE");
  fs.writeFileSync(path.join(DIST_ASSETS_DIR, keywordFile), placeholderKeyword);
  fs.writeFileSync(
    path.join(PUBLIC_ASSETS_DIR, keywordFile),
    placeholderKeyword,
  );
  console.log(`   - Created placeholder: ${keywordFile}`);
}

// Summary
console.log("\n📊 Summary:");
console.log("===========");

if (foundWorker) {
  console.log("✅ Worker file extracted");
} else {
  console.log("❌ Worker file not found - wake word won't work without it");
}

if (foundWasm) {
  console.log("✅ WASM files extracted");
} else {
  console.log("⚠️  WASM files need to be downloaded from Picovoice Console");
}

console.log("\n📝 Next Steps:");
console.log("=============");

if (!foundWasm) {
  console.log("\nTo enable Porcupine wake word detection:");
  console.log("1. Go to https://console.picovoice.ai/");
  console.log("2. Create a free account");
  console.log("3. Download the following files:");
  console.log("   - pv_porcupine.wasm");
  console.log("   - pv_porcupine_simd.wasm (optional, for better performance)");
  console.log("   - porcupine_params.pv");
  console.log('   - Your custom wake word file (e.g., "Hey Luna")');
  console.log("4. Place them in: app/renderer/public/assets/");
  console.log("\nOR");
  console.log("\nThe app will automatically use Web Speech API as fallback!");
}

console.log(
  "\n✨ The app will work fine without Porcupine assets - it will use Web Speech API instead.\n",
);
