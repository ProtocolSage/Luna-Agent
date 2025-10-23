/**
 * Fix the remaining renderer.tsx error
 */
const fs = require('fs');
const path = require('path');

console.log('🔧 Fixing renderer.tsx error...\n');

const rendererPath = path.join(__dirname, 'app/renderer/renderer.tsx');
let renderer = fs.readFileSync(rendererPath, 'utf8');

// More specific replacement for the ErrorBoundary with onError prop
renderer = renderer.replace(
  /<ErrorBoundary\s+onError=\{[^}]+\}\s*>/gs,
  '<ErrorBoundary>'
);

// Alternative approach - remove the entire onError prop including multiline
renderer = renderer.replace(
  /<ErrorBoundary\s*\n\s*onError=\{[\s\S]*?\}\s*>/g,
  '<ErrorBoundary>'
);

fs.writeFileSync(rendererPath, renderer);
console.log('✅ Fixed renderer.tsx - removed onError prop');
console.log('\nNow run: npm run build');
