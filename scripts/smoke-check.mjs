import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const projectRoot = path.resolve(__dirname, '..');

function must(filePath) {
  const fullPath = path.join(projectRoot, filePath);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`Smoke check failed: Required file not found: ${filePath}`);
  }
  console.log(`✅ Found: ${filePath}`);
}

console.log('🚀 Running smoke checks...');

try {
  // Check essential build outputs
  must('dist/bootstrap.cjs');
  must('dist/app/main/main.js');
  must('dist/app/main/preload.js');
  must('dist/backend/server.js');
  must('dist/app/renderer/renderer.js');
  must('dist/app/renderer/index.html');

  // Voice health checks
  must('dist/app/renderer/assets/vad/vad.worklet.bundle.min.js');
  must('dist/app/renderer/assets/vad/silero_vad.onnx');
  console.log('✅ VAD assets present');

  // Optionally: size sanity for VAD model
  const sileroVadPath = path.join(projectRoot, 'dist/app/renderer/assets/vad/silero_vad.onnx');
  if (fs.existsSync(sileroVadPath)) {
    const sz = fs.statSync(sileroVadPath).size;
    if (sz < 100 * 1024) { // Example: check if less than 100KB
      throw new Error(`Smoke check failed: silero_vad.onnx suspiciously small (${(sz / 1024).toFixed(2)} KB)`);
    }
    console.log(`✅ silero_vad.onnx size check passed (${(sz / 1024).toFixed(2)} KB)`);
  } else {
    console.warn('⚠️  silero_vad.onnx not found for size check.');
  }

  console.log('🎉 All smoke checks passed!');
  process.exit(0);
} catch (error) {
  console.error(`❌ Smoke check failed: ${error.message}`);
  process.exit(1);
}
