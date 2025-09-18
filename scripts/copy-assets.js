#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

function exists(p) { try { return fs.existsSync(p); } catch { return false; } }

/**
 * Cross-platform asset copying script for Luna Agent build process
 * Replaces Unix cp commands with Node.js file operations
 */

function copyFileSync(src, dest) {
    try {
        // Ensure destination directory exists
        const destDir = path.dirname(dest);
        if (!fs.existsSync(destDir)) {
            fs.mkdirSync(destDir, { recursive: true });
        }
        
        fs.copyFileSync(src, dest);
        console.log(`? Copied: ${src} ? ${dest}`);
        return true;
    } catch (error) {
        console.error(`? Failed to copy ${src} ? ${dest}:`, error.message);
        return false;
    }
}

function copyDirSync(src, dest) {
    try {
        if (!fs.existsSync(dest)) {
            fs.mkdirSync(dest, { recursive: true });
        }
        
        const items = fs.readdirSync(src);
        let success = true;
        
        for (const item of items) {
            const srcPath = path.join(src, item);
            const destPath = path.join(dest, item);
            const stat = fs.statSync(srcPath);
            
            if (stat.isDirectory()) {
                if (!copyDirSync(srcPath, destPath)) {
                    success = false;
                }
            } else {
                if (!copyFileSync(srcPath, destPath)) {
                    success = false;
                }
            }
        }
        
        if (success) {
            console.log(`? Copied directory: ${src} ? ${dest}`);
        }
        return success;
    } catch (error) {
        console.error(`? Failed to copy directory ${src} ? ${dest}:`, error.message);
        return false;
    }
}

function copyBackendJs() {
    console.log('\n[1/5] Copying backend JavaScript files...');
    const backendDir = 'backend';
    const distBackendDir = 'dist/backend';
    
    if (!fs.existsSync(backendDir)) {
        console.error(`? Backend directory not found: ${backendDir}`);
        return false;
    }
    
    // Ensure dist/backend directory exists
    if (!fs.existsSync(distBackendDir)) {
        fs.mkdirSync(distBackendDir, { recursive: true });
    }
    
    const files = fs.readdirSync(backendDir);
    const jsFiles = files.filter(file => file.endsWith('.js'));
    
    if (jsFiles.length === 0) {
        console.log('No .js files found in backend directory');
        return true;
    }
    
    let success = true;
    for (const file of jsFiles) {
        const src = path.join(backendDir, file);
        const dest = path.join(distBackendDir, file);
        if (!copyFileSync(src, dest)) {
            success = false;
        }
    }
    
    return success;
}

function copyAgentAssets() {
    console.log('\n[2/5] Copying agent non-TypeScript assets...');
    // Agent TypeScript files are compiled by tsc, only copy non-TS files if any
    const src = 'agent';
    const dest = 'dist/agent';
    
    if (!fs.existsSync(src)) {
        console.log('No agent directory found, skipping...');
        return true;
    }
    
    // Only copy non-TypeScript files (like .md, .json, etc.)
    return copyNonTsFiles(src, dest);
}

function copyNonTsFiles(srcDir, destDir) {
    try {
        if (!fs.existsSync(srcDir)) {
            return true;
        }
        
        const items = fs.readdirSync(srcDir);
        let success = true;
        
        for (const item of items) {
            const srcPath = path.join(srcDir, item);
            const destPath = path.join(destDir, item);
            const stat = fs.statSync(srcPath);
            
            if (stat.isDirectory()) {
                // Recursively copy directories
                if (!copyNonTsFiles(srcPath, destPath)) {
                    success = false;
                }
            } else if (!item.endsWith('.ts') && !item.endsWith('.tsx')) {
                // Only copy non-TypeScript files
                if (!fs.existsSync(path.dirname(destPath))) {
                    fs.mkdirSync(path.dirname(destPath), { recursive: true });
                }
                if (!copyFileSync(srcPath, destPath)) {
                    success = false;
                }
            }
        }
        
        return success;
    } catch (error) {
        console.error(`? Failed to copy non-TS files from ${srcDir}:`, error.message);
        return false;
    }
}

function verifyBackendCompilation() {
    console.log('\n[3/5] Verifying backend compilation...');
    const serverPath = 'dist/backend/server.js';
    
    if (!fs.existsSync(serverPath)) {
        console.warn('??  Backend server not found at dist/backend/server.js (continuing).');
        return true; // Don't fail, just warn
    }
    
    console.log(`? Backend compiled: ${serverPath}`);
    return true;
}

function copyRendererHtml() {
    console.log('\n[4/8] Copying renderer HTML...');
    const src = 'app/renderer/index.csp.html';
    const dest = 'dist/app/renderer/index.html';
    const legacySrc = 'app/renderer/index.legacy.html';
    const legacyDest = 'dist/app/renderer/index.legacy.html';
    const showLegacy = (process.env.SHOW_LEGACY ?? 'false').toLowerCase() === 'true';

    if (!fs.existsSync(src)) {
        console.error('? Source file not found: ' + src);
        return false;
    }

    const copied = copyFileSync(src, dest);

    if (showLegacy && fs.existsSync(legacySrc)) {
        copyFileSync(legacySrc, legacyDest);
    } else if (!showLegacy && fs.existsSync(legacyDest)) {
        fs.rmSync(legacyDest, { force: true });
        console.log('?? Removed legacy renderer HTML (SHOW_LEGACY disabled).');
    }

    return copied;
}

function copyRendererStyles() {
    console.log('\n[5/8] Copying renderer styles...');
    const src = 'app/renderer/styles';
    const dest = 'dist/app/renderer/styles';
    
    if (!fs.existsSync(src)) {
        console.error(`? Source directory not found: ${src}`);
        return false;
    }
    
    return copyDirSync(src, dest);
}

function copyRendererLoader() {
    console.log('\n[6/8] Copying renderer loader...');
    const src = 'app/renderer/loader.js';
    const dest = 'dist/app/renderer/loader.js';
    
    if (!fs.existsSync(src)) {
        console.error(`? Source file not found: ${src}`);
        return false;
    }
    
    return copyFileSync(src, dest);
}

function copyRendererBoot() {
    console.log('\n[7/8] Copying renderer boot module...');
    const src = 'app/renderer/boot.mjs';
    const dest = 'dist/app/renderer/boot.mjs';
    
    if (!fs.existsSync(src)) {
        console.error(`? Source file not found: ${src}`);
        return false;
    }
    
    return copyFileSync(src, dest);
}

function copyConfigDirectory() {
    console.log('\n[8/8] Copying config files...');
    const src = 'config';
    const dest = 'dist/config';
    
    if (!fs.existsSync(src)) {
        console.error(`? Source directory not found: ${src}`);
        return false;
    }
    
    return copyDirSync(src, dest);
}

function main() {
    console.log('?? Starting asset copying process...\n');
    
    const tasks = [
        copyBackendJs,
        copyAgentAssets,
        verifyBackendCompilation, 
        copyRendererHtml,
        copyRendererStyles,
        copyRendererLoader,
        copyRendererBoot,
        copyConfigDirectory
    ];
    
    let allSuccess = true;
    
    for (const task of tasks) {
        if (!task()) {
            allSuccess = false;
        }
    }
    
    console.log('\n' + '='.repeat(50));
    
    if (allSuccess) {
        console.log('? All assets copied successfully!');
        process.exit(0);
    } else {
        console.error('? Some assets failed to copy. Check errors above.');
        process.exit(1);
    }
}

// Run the script
if (require.main === module) {
    main();
}

module.exports = {
    copyFileSync,
    copyDirSync,
    copyBackendJs,
    copyAgentAssets,
    verifyBackendCompilation,
    copyRendererHtml,
    copyRendererStyles,
    copyConfigDirectory
};