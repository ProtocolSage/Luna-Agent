#!/usr/bin/env node
const { spawnSync } = require("child_process");

if (process.env.CI || process.env.SKIP_MODEL_FETCH) {
  console.log("postinstall: skipping model fetch (CI/SKIP_MODEL_FETCH).");
  process.exit(0);
}

function run(cmd, args) {
  const r = spawnSync(cmd, args, { stdio: "inherit" });
  return r.status === 0;
}

if (process.platform === "win32") {
  // Use Windows PowerShell
  if (
    !run("powershell", [
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      "scripts/fetch-whisper.ps1",
    ])
  ) {
    process.exit(1);
  }
} else {
  // Try PowerShell Core (pwsh); if missing, just skip with a notice
  if (
    !run("pwsh", [
      "-NoLogo",
      "-NoProfile",
      "-File",
      "scripts/fetch-whisper.ps1",
    ])
  ) {
    console.log(
      "postinstall: pwsh not found; skipping model fetch on non-Windows.",
    );
  }
}
