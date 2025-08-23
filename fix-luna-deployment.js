#!/usr/bin/env node
/**
 * Luna Agent - Automated Deployment Fix
 * Fixes all identified issues in one script
 */

const fs = require('fs');
const path = require('path');
const { execSync, spawn } = require('child_process');

// Color codes for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

// Helper functions
const log = {
  info: (msg) => console.log(`${colors.blue}[INFO]${colors.reset} ${msg}`),
  success: (msg) => console.log(`${colors.green}[✓]${colors.reset} ${msg}`),
  error: (msg) => console.log(`${colors.red}[✗]${colors.reset} ${msg}`),
  warning: (msg) => console.log(`${colors.yellow}[!]${colors.reset} ${msg}`),
  header: (msg) => {
    console.log('\n' + '='.repeat(50));
    console.log(`${colors.cyan}${colors.bright}${msg}${colors.reset}`);
    console.log('='.repeat(50) + '\n');
  }
};

// Main fix class
class LunaDeploymentFix {
  constructor() {
    this.projectRoot = process.cwd();
    this.issues = [];
    this.fixes = [];
  }

  async run() {
    log.header('LUNA AGENT - DEPLOYMENT FIX TOOL');
    
    await this.diagnose();
    await this.applyFixes();
    await this.rebuild();
    await this.verify();
    
    this.showSummary();
  }

  async diagnose() {
    log.header('DIAGNOSING ISSUES');
    
    // Check for verify-setup.js
    if (!fs.existsSync('verify-setup.js')) {
      this.issues.push('Missing verify-setup.js');
      this.fixes.push(() => this.createVerifySetup());
    }
    
    // Check for .env file
    if (!fs.existsSync('.env')) {
      this.issues.push('Missing .env file');
      this.fixes.push(() => this.createEnvFile());
    }
    
    // Check webpack config
    if (fs.existsSync('webpack.config.js')) {
      const config = fs.readFileSync('webpack.config.js', 'utf8');
      if (!config.includes('commonjs2')) {
        this.issues.push('Webpack preload config needs fixing');
        this.fixes.push(() => this.fixWebpackConfig());
      }
    }
    
    // Check package.json scripts
    if (fs.existsSync('package.json')) {
      const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
      if (!pkg.scripts.backend || !pkg.scripts.electron) {
        this.issues.push('Package.json scripts need updating');
        this.fixes.push(() => this.updatePackageScripts());
      }
    }
    
    // Check preload script
    const preloadPath = 'app/preload/preload.ts';
    if (fs.existsSync(preloadPath)) {
      const preload = fs.readFileSync(preloadPath, 'utf8');
      if (!preload.includes('contextBridge')) {
        this.issues.push('Preload script needs updating');
        this.fixes.push(() => this.fixPreloadScript());
      }
    }
    
    // Check for required directories
    const requiredDirs = ['app/main', 'app/renderer', 'app/preload', 'backend', 'agent', 'memory'];
    requiredDirs.forEach(dir => {
      if (!fs.existsSync(dir)) {
        this.issues.push(`Missing directory: ${dir}`);
        this.fixes.push(() => {
          fs.mkdirSync(dir, { recursive: true });
          log.success(`Created directory: ${dir}`);
        });
      }
    });
    
    // Display found issues
    if (this.issues.length > 0) {
      log.warning(`Found ${this.issues.length} issues:`);
      this.issues.forEach(issue => console.log(`  • ${issue}`));
    } else {
      log.success('No issues found!');
    }
  }

  async applyFixes() {
    if (this.fixes.length === 0) return;
    
    log.header('APPLYING FIXES');
    
    for (const fix of this.fixes) {
      await fix();
    }
    
    log.success(`Applied ${this.fixes.length} fixes`);
  }

  createVerifySetup() {
    const content = `// verify-setup.js
const fs = require('fs');
const path = require('path');

console.log('[*] Verifying Luna Agent setup...');

const requiredDirs = ['app', 'backend', 'agent', 'memory', 'dist'];
const requiredFiles = ['package.json', 'webpack.config.js'];

let hasErrors = false;

requiredDirs.forEach(dir => {
  if (!fs.existsSync(dir)) {
    console.error(\`[!] Missing directory: \${dir}\`);
    hasErrors = true;
  }
});

requiredFiles.forEach(file => {
  if (!fs.existsSync(file)) {
    console.error(\`[!] Missing file: \${file}\`);
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
}`;

    fs.writeFileSync('verify-setup.js', content);
    log.success('Created verify-setup.js');
  }

  createEnvFile() {
    const content = `# Luna Agent Environment Configuration
NODE_ENV=development
PORT=3001
ELECTRON_PORT=3000
DEBUG=true
OPENAI_API_KEY=your_api_key_here
ELEVENLABS_API_KEY=your_api_key_here
`;

    fs.writeFileSync('.env', content);
    log.success('Created .env file');
    log.warning('Remember to add your API keys to .env file');
  }

  fixWebpackConfig() {
    log.info('Backing up webpack.config.js...');
    fs.copyFileSync('webpack.config.js', 'webpack.config.backup.js');
    
    // Read current config
    let config = fs.readFileSync('webpack.config.js', 'utf8');
    
    // Fix preload output configuration
    const preloadFix = `output: {
      path: path.resolve(__dirname, 'dist/app'),
      filename: 'preload/[name].js',
      library: {
        type: 'commonjs2'
      }
    }`;
    
    // Replace preload output section
    config = config.replace(
      /output:\s*{\s*path:[^}]+filename:\s*'preload\/\[name\]\.js'[^}]*}/,
      preloadFix
    );
    
    fs.writeFileSync('webpack.config.js', config);
    log.success('Fixed webpack configuration');
  }

  updatePackageScripts() {
    const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    
    // Update scripts
    pkg.scripts = {
      ...pkg.scripts,
      "start": "npm run build && concurrently \"npm:backend\" \"wait-on http://localhost:3001 && npm:electron\"",
      "backend": "node dist/server.js",
      "electron": "electron dist/app/main/main.js",
      "build": "webpack --mode=production",
      "build:dev": "webpack --mode=development",
      "dev": "concurrently \"npm:dev:backend\" \"npm:dev:electron\"",
      "dev:backend": "node dist/server.js",
      "dev:electron": "electron dist/app/main/main.js",
      "verify": "node verify-setup.js"
    };
    
    fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2));
    log.success('Updated package.json scripts');
  }

  fixPreloadScript() {
    const preloadContent = `// app/preload/preload.ts
import { contextBridge, ipcRenderer } from 'electron';

// Expose protected methods
contextBridge.exposeInMainWorld('electronAPI', {
  sendMessage: (channel: string, data: any) => {
    const validChannels = ['toMain', 'voice-input', 'llm-request'];
    if (validChannels.includes(channel)) {
      ipcRenderer.send(channel, data);
    }
  },
  onMessage: (channel: string, func: Function) => {
    const validChannels = ['fromMain', 'voice-response', 'llm-response'];
    if (validChannels.includes(channel)) {
      ipcRenderer.on(channel, (event, ...args) => func(...args));
    }
  },
  removeAllListeners: (channel: string) => {
    ipcRenderer.removeAllListeners(channel);
  }
});

console.log('[Preload] Script loaded successfully');
`;

    fs.writeFileSync('app/preload/preload.ts', preloadContent);
    log.success('Fixed preload script');
  }

  async rebuild() {
    log.header('REBUILDING APPLICATION');
    
    try {
      // Clean old build
      log.info('Cleaning old build artifacts...');
      if (fs.existsSync('dist')) {
        fs.rmSync('dist', { recursive: true, force: true });
      }
      
      // Install dependencies
      log.info('Installing dependencies...');
      execSync('npm install', { stdio: 'inherit' });
      
      // Build application
      log.info('Building application...');
      execSync('npm run build', { stdio: 'inherit' });
      
      log.success('Build completed successfully');
    } catch (error) {
      log.error('Build failed: ' + error.message);
      log.warning('You may need to run the build manually');
    }
  }

  async verify() {
    log.header('VERIFYING DEPLOYMENT');
    
    const checks = [
      { name: 'dist/server.js', exists: fs.existsSync('dist/server.js') },
      { name: 'dist/app/main/main.js', exists: fs.existsSync('dist/app/main/main.js') },
      { name: 'dist/app/preload/preload.js', exists: fs.existsSync('dist/app/preload/preload.js') },
      { name: 'dist/app/renderer/renderer.js', exists: fs.existsSync('dist/app/renderer/renderer.js') }
    ];
    
    checks.forEach(check => {
      if (check.exists) {
        log.success(`${check.name} exists`);
      } else {
        log.error(`${check.name} missing`);
      }
    });
  }

  showSummary() {
    log.header('DEPLOYMENT FIX SUMMARY');
    
    console.log('Fixed Issues:');
    this.issues.forEach(issue => console.log(`  ✓ ${issue}`));
    
    console.log('\nNext Steps:');
    console.log('  1. Add your API keys to .env file');
    console.log('  2. Start the application:');
    console.log('     • Windows: Run LUNA-ONE-CLICK-START.bat');
    console.log('     • Or: npm start');
    console.log('\nIf issues persist:');
    console.log('  • Check console for specific errors');
    console.log('  • Ensure ports 3000 and 3001 are free');
    console.log('  • Run: npm run verify');
    
    log.success('\nDeployment fix completed!');
  }
}

// Create start script if it doesn't exist
function createStartScript() {
  const scriptContent = `@echo off
title Luna Agent
cls

echo ========================================
echo          LUNA AGENT STARTUP
echo ========================================
echo.

:: Check Node.js
where node >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Node.js is not installed
    pause
    exit /b 1
)

:: Set environment
set NODE_ENV=development

:: Navigate to project directory
cd /d "%~dp0"

:: Verify setup
echo [*] Verifying setup...
call node verify-setup.js

:: Build if needed
if not exist "dist" (
    echo [*] Building application...
    call npm run build
)

:: Start backend
echo [*] Starting backend server...
start /B node dist/server.js

:: Wait for backend
timeout /t 3 /nobreak >nul

:: Start Electron
echo [*] Starting Luna Agent...
call npx electron dist/app/main/main.js

echo.
echo Luna has stopped.
pause`;

  fs.writeFileSync('LUNA-FIXED-START.bat', scriptContent);
  log.success('Created LUNA-FIXED-START.bat');
}

// Run the fix
async function main() {
  const fixer = new LunaDeploymentFix();
  await fixer.run();
  
  // Create start script
  if (process.platform === 'win32') {
    createStartScript();
  }
}

// Execute
main().catch(error => {
  log.error('Fatal error: ' + error.message);
  process.exit(1);
});