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

// If someone *still* tries to run this with Node, fail loudly.
const electronModule = require('electron'); // In wrong mode this is a string.
if (typeof electronModule === 'string') {
  console.error('[Fatal] Electron started in Node mode. Refusing to continue.');
  process.exit(1);
}

// Delegate to your real compiled main
require('./app/main/main.js');
`;

fs.writeFileSync(outFile, content, 'utf8');
console.log(`[bootstrap] Wrote ${outFile}`);
