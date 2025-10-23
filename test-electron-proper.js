// Test with proper electron loading for v28
console.log('[Test] Electron version:', process.versions.electron);

// In Electron's main process, the `electron` module should be built-in
// Try accessing directly from process
console.log('[Test] process.type:', process.type);
console.log('[Test] process._linkedBinding:', typeof process._linkedBinding);

// Try the new way - using process.electronBinding
if (typeof process.electronBinding === 'function') {
  console.log('[Test] electronBinding is available');
  try {
    const  binding = process.electronBinding('electron_browser_app');
    console.log('[Test] Got electron binding:', typeof binding);
  } catch (e) {
    console.log('[Test] electronBinding error:', e.message);
  }
}

// Try using the built-in require
const Module = require('module');
console.log('[Test] Module.builtinModules:', Module.builtinModules ? Module.builtinModules.slice(0, 5) : 'not available');

// Check if electron is a builtin
console.log('[Test] Is electron builtin?', Module.builtinModules && Module.builtinModules.includes('electron'));
