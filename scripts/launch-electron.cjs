// Robust Electron launcher that waits for Electron to exit.
// Prevents 'concurrently' from killing the backend immediately.
const { spawn } = require('child_process');
const path = require('path');

const electronBin =
  process.env.ELECTRON_PATH ||
  require('electron'); // resolves to electron binary path

// Create a clean environment without ELECTRON_RUN_AS_NODE to prevent Node mode
const cleanEnv = { ...process.env };
delete cleanEnv.ELECTRON_RUN_AS_NODE;

const child = spawn(electronBin, ['.'], {
  stdio: 'inherit',
  cwd: path.resolve(__dirname, '..'),
  env: cleanEnv,
});

child.on('exit', (code, signal) => {
  if (signal) {
    console.log(`[electron] exited via signal ${signal}`);
    process.exit(1);
  }
  console.log(`[electron] exited with code ${code}`);
  process.exit(code ?? 0);
});
