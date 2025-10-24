#!/usr/bin/env node

// ===============================================================================
// 🔍 Luna Agent Build System Health Check
// ===============================================================================
// Verifies that the single source of truth build system is working correctly
// Run: node verify-build-system.js
// ===============================================================================

const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");

const colors = {
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  reset: "\x1b[0m",
};

function log(message, color = "reset") {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function checkFile(filePath, description) {
  if (fs.existsSync(filePath)) {
    log(`✅ ${description}: ${filePath}`, "green");
    return true;
  } else {
    log(`❌ ${description}: MISSING - ${filePath}`, "red");
    return false;
  }
}

function checkUnusedFile(filePath, description) {
  if (fs.existsSync(filePath)) {
    log(`⚠️  ${description}: ${filePath} (should be marked .UNUSED)`, "yellow");
    return false;
  } else {
    log(`✅ ${description}: Properly cleaned up`, "green");
    return true;
  }
}

async function runCommand(command, description) {
  return new Promise((resolve) => {
    log(`🔨 Testing: ${description}`, "blue");
    exec(command, (error, stdout, stderr) => {
      if (error) {
        log(`❌ ${description}: FAILED`, "red");
        log(`   Error: ${error.message}`, "red");
        resolve(false);
      } else {
        log(`✅ ${description}: SUCCESS`, "green");
        resolve(true);
      }
    });
  });
}

async function main() {
  log("🎯 Luna Agent Build System Health Check", "blue");
  log("=".repeat(50), "blue");

  let allGood = true;

  // Check source of truth files exist
  log("\n📁 Source of Truth Files:", "blue");
  allGood &= checkFile("webpack.dev.js", "Development renderer config");
  allGood &= checkFile(
    "scripts/build-renderer.js",
    "Production renderer build",
  );
  allGood &= checkFile("webpack.config.js", "Backend config only");

  // Check unused files are properly marked
  log("\n🚫 Unused Files Status:", "blue");
  allGood &= checkFile(
    "webpack.renderer.UNUSED.js",
    "Unused webpack renderer (marked)",
  );
  allGood &= checkFile(
    "webpack.renderer.config.UNUSED.js",
    "Unused webpack config (marked)",
  );

  // Check build outputs after production build
  log("\n🏗️  Testing Production Build:", "blue");
  const buildSuccess = await runCommand(
    "npm run build:renderer",
    "Production renderer build",
  );

  if (buildSuccess) {
    log("\n📦 Build Outputs:", "blue");
    allGood &= checkFile(
      "dist/app/renderer/renderer.js",
      "Renderer bundle (esbuild)",
    );
    allGood &= checkFile("dist/app/renderer/index.html", "HTML entry");
    allGood &= checkFile(
      "dist/app/renderer/assets/vad.worklet.bundle.min.js",
      "VAD worklet",
    );
    allGood &= checkFile(
      "dist/app/renderer/assets/silero_vad.onnx",
      "VAD model",
    );
    allGood &= checkFile(
      "dist/app/renderer/assets/silero_vad_legacy.onnx",
      "VAD legacy model",
    );
  } else {
    allGood = false;
  }

  // Final status
  log("\n" + "=".repeat(50), "blue");
  if (allGood) {
    log("🎉 BUILD SYSTEM HEALTH: EXCELLENT", "green");
    log("✅ Single source of truth is properly configured", "green");
  } else {
    log("💥 BUILD SYSTEM HEALTH: NEEDS ATTENTION", "red");
    log("❌ Some issues need to be resolved", "red");
  }
  log("=".repeat(50), "blue");
}

main().catch(console.error);
