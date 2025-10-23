const fs = require('fs');
const path = require('path');

console.log('📝 Updating package.json scripts...');

const packageJsonPath = path.join(__dirname, '../package.json');

try {
  // Read current package.json
  const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

  // Add/update scripts
  pkg.scripts = {
    ...pkg.scripts,
    "postinstall": "node scripts/rebuild.js",
    "rebuild": "node scripts/rebuild.js",
    "copy-assets": "node scripts/copy-assets.js",
    "prebuild": "npm run copy-assets",
    "prestart": "npm run copy-assets",
    "test": "jest",
    "test:watch": "jest --watch",
    "lint": "eslint src --ext .ts,.tsx",
    "clean": "rimraf dist logs"
  };

  // Write updated package.json
  fs.writeFileSync(packageJsonPath, JSON.stringify(pkg, null, 2));

  console.log('✅ package.json updated successfully');
  console.log('\n📋 New scripts added:');
  console.log('  - postinstall: Auto-rebuild native modules');
  console.log('  - rebuild: Manually rebuild native modules');
  console.log('  - copy-assets: Copy wake word assets');
  console.log('  - prebuild/prestart: Auto-copy assets before build/start');

} catch (error) {
  console.error('❌ Failed to update package.json:', error.message);
  process.exit(1);
}
