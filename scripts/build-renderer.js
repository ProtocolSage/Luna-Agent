const esbuild = require('esbuild');
const path = require('path');
const fs = require('fs');

async function buildRenderer() {
  try {
    console.log('🔨 Building renderer with esbuild (ESM format)...');
    
    const result = await esbuild.build({
      entryPoints: [path.join(__dirname, '../app/renderer/renderer.tsx')],
      bundle: true,
      format: 'esm',
      platform: 'browser',
      target: 'es2020',
      outfile: path.join(__dirname, '../dist/app/renderer/renderer.js'),
      loader: {
        '.ts': 'ts',
        '.tsx': 'tsx',
        '.js': 'jsx',
        '.jsx': 'jsx',
        '.css': 'css'
      },
      define: {
        'process.env.NODE_ENV': '"production"',
        'process.env.REACT_APP_API_URL': '"http://localhost:3000"',
        'process.env.SENTRY_DSN': '""',
        'process.env.ERROR_REPORTING_ENDPOINT': '""'
      },
      minify: process.env.NODE_ENV === 'production',
      sourcemap: process.env.NODE_ENV !== 'production',
      // Don't bundle electron since it's provided by the runtime
      external: ['electron'],
      logLevel: 'info',
      metafile: false
    });
    
    console.log('✅ Renderer built successfully with esbuild (ESM format)');
    
    // Ensure CSS is linked in index.html
    const indexPath = path.join(__dirname, '../dist/app/renderer/index.html');
    if (fs.existsSync(indexPath)) {
      let html = fs.readFileSync(indexPath, 'utf8');
      if (!html.includes('renderer.css')) {
        html = html.replace(
          '<link rel="stylesheet" href="styles/luxury.css">',
          '<link rel="stylesheet" href="renderer.css">\n    <link rel="stylesheet" href="styles/luxury.css">'
        );
        fs.writeFileSync(indexPath, html);
        console.log('✅ Updated index.html with renderer.css link');
      }
    }
  } catch (error) {
    console.error('❌ Build failed:', error);
    process.exit(1);
  }
}

buildRenderer();
