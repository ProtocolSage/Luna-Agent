#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🚀 Starting full build process...\n');

try {
  // Step 1: Clean dist directory
  console.log('🧹 Cleaning dist directory...');
  if (fs.existsSync('dist')) {
    fs.rmSync('dist', { recursive: true, force: true });
  }
  
  // Step 2: Compile TypeScript for main process and preload with separate configs
  console.log('📦 Compiling TypeScript for main process...');
  execSync('npx tsc -p tsconfig.main.json', { stdio: 'inherit' });
  
  console.log('📦 Compiling TypeScript for preload...');
  execSync('npx tsc -p tsconfig.preload.json', { stdio: 'inherit' });
  
  // Step 2.5: Compile backend TypeScript
  console.log('📦 Compiling TypeScript for backend...');
  execSync('npx tsc -p tsconfig.backend.json', { stdio: 'inherit' });
  
  // Step 3: Build renderer with esbuild
  console.log('🎨 Building renderer with esbuild...');
  execSync('node scripts/build-renderer.js', { stdio: 'inherit' });
  
  // Step 4: Copy assets
  console.log('📁 Copying assets...');
  execSync('node scripts/copy-assets.js', { stdio: 'inherit' });
  
  console.log('\n✅ Build completed successfully!');
  console.log('📂 Output directory: dist/');
  console.log('🚀 Run "npm run electron" to start the application');
  
} catch (error) {
  console.error('\n❌ Build failed:', error.message);
  process.exit(1);
}
