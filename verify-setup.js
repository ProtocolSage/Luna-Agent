// verify-setup.js
const fs = require('fs');
const path = require('path');

console.log('[*] Verifying Luna Agent setup...');

const requiredDirs = ['app', 'backend', 'agent', 'memory', 'dist'];
const requiredFiles = ['package.json', 'webpack.config.js'];

let hasErrors = false;

requiredDirs.forEach(dir => {
  if (!fs.existsSync(dir)) {
    console.error(`[!] Missing directory: ${dir}`);
    hasErrors = true;
  }
});

requiredFiles.forEach(file => {
  if (!fs.existsSync(file)) {
    console.error(`[!] Missing file: ${file}`);
    hasErrors = true;
  }
});

if (!hasErrors) {
  console.log('[✓] All required files present');
  process.exit(0);
} else {
  console.log('[!] Setup verification failed');
  // Don't exit with error - allow startup to continue
  process.exit(0);
}