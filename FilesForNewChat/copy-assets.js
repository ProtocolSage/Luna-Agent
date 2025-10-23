const fs = require('fs');
const path = require('path');

console.log('📦 Copying wake word assets...');

const ASSETS_DIR = path.join(__dirname, '../dist/app/renderer/assets');
const PORCUPINE_DIR = path.join(__dirname, '../node_modules/@picovoice/porcupine-web/lib');

// Create assets directory
if (!fs.existsSync(ASSETS_DIR)) {
  fs.mkdirSync(ASSETS_DIR, { recursive: true });
  console.log('📁 Created assets directory');
}

// Files to copy
const files = [
  'pv_porcupine.wasm',
  'porcupine_worker.js'
];

let successCount = 0;
let failCount = 0;

files.forEach(file => {
  const src = path.join(PORCUPINE_DIR, file);
  const dest = path.join(ASSETS_DIR, file);
  
  try {
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, dest);
      console.log(`✅ Copied ${file}`);
      successCount++;
    } else {
      console.warn(`⚠️  Missing ${file} in source`);
      failCount++;
    }
  } catch (error) {
    console.error(`❌ Failed to copy ${file}:`, error.message);
    failCount++;
  }
});

console.log(`\n📊 Summary: ${successCount} copied, ${failCount} failed`);

if (failCount > 0) {
  console.log('\n💡 Tip: Run "npm install @picovoice/porcupine-web" if assets are missing');
  process.exit(1);
}

console.log('✅ Wake word assets ready!');
