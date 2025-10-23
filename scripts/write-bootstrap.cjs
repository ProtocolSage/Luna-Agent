#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const distDir = path.resolve(__dirname, '..', 'dist');
const outFile = path.join(distDir, 'bootstrap.cjs');

if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

const content = `// Bootstrap for Luna Agent - Ensures Electron loads correctly
//
// The issue: When Node.js require('electron'), it resolves to the package's main field
// which returns a STRING path to electron.exe instead of the Electron API object.
//
// Solution: Override module._load to intercept electron requires and return the correct API.

const path = require('path');
const fs = require('fs');

if (process.env.ELECTRON_RUN_AS_NODE === '1') {
  delete process.env.ELECTRON_RUN_AS_NODE;
}

// Intercept require('electron') to return the API, not the path
const Module = require('module');
const originalLoad = Module._load;

Module._load = function(request, parent, isMain) {
  // If this is a require('electron'), force it to load the electron/index.js which has the API
  if (request === 'electron') {
    // Resolve to the electron module directory
    const electronPath = require.resolve('electron');
    const electronDir = electronPath.substring(0, electronPath.lastIndexOf(path.sep));
    const electronIndexPath = path.join(electronDir, 'index.js');

    // If the index.js exists, require it directly - this has the actual Electron API
    if (fs.existsSync(electronIndexPath)) {
      return originalLoad.call(this, electronIndexPath, parent, isMain);
    }
  }

  return originalLoad.call(this, request, parent, isMain);
};

// Now load the main process
require('./app/main/main.js');
`;

fs.writeFileSync(outFile, content, 'utf8');
console.log(`[bootstrap] Wrote ${outFile}`);
