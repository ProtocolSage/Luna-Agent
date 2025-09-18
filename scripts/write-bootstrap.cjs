#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const distDir = path.resolve(__dirname, '..', 'dist');
const outFile = path.join(distDir, 'bootstrap.cjs');

if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

const content = `// Hard kill the poison before your real main runs
if (process.env.ELECTRON_RUN_AS_NODE === '1') {
  delete process.env.ELECTRON_RUN_AS_NODE;
}

// Delegate to the compiled main process entrypoint
require('./app/main/main.js');
`;

fs.writeFileSync(outFile, content, 'utf8');
console.log(`[bootstrap] Wrote ${outFile}`);
