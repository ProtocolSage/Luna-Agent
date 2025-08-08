const webpack = require('webpack');
const fs = require('fs');
const path = require('path');

// Copy config files to dist
function copyConfigFiles() {
  const configSrc = path.join(__dirname, 'config');
  const configDest = path.join(__dirname, 'dist/config');
  
  if (!fs.existsSync(configDest)) {
    fs.mkdirSync(configDest, { recursive: true });
  }
  
  if (fs.existsSync(configSrc)) {
    const files = fs.readdirSync(configSrc);
    files.forEach(file => {
      if (file.endsWith('.json')) {
        fs.copyFileSync(
          path.join(configSrc, file),
          path.join(configDest, file)
        );
      }
    });
    console.log('Copied config files to dist/config/');
  }
}

// Renderer config
const rendererConfig = require('./webpack.renderer.js');

// Main config
const mainConfig = require('./webpack.main.js');

// Preload config
const preloadConfig = {
  mode: 'production',
  target: 'electron-preload',
  entry: './app/main/preload.ts',
  output: {
    path: path.resolve(__dirname, 'dist/app/main'),
    filename: 'preload.js'
  },
  externals: {
    'electron': 'commonjs2 electron'
  },
  resolve: {
    extensions: ['.ts', '.tsx', '.js', '.jsx']
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: {
          loader: 'ts-loader',
          options: {
            transpileOnly: true,
            compilerOptions: {
              noEmit: false
            }
          }
        },
        exclude: /node_modules/
      }
    ]
  }
};

console.log('Building renderer...');
webpack(rendererConfig, (err, stats) => {
  if (err) {
    console.error('Renderer build failed:', err);
    return;
  }
  console.log('Renderer build complete');
  
  console.log('Building main...');
  webpack(mainConfig, (err, stats) => {
    if (err) {
      console.error('Main build failed:', err);
      return;
    }
    console.log('Main build complete');
    
    console.log('Building preload...');
    webpack(preloadConfig, (err, stats) => {
      if (err) {
        console.error('Preload build failed:', err);
        return;
      }
      console.log('Preload build complete');
      copyConfigFiles();
      console.log('\nBuild complete! Run with: npm start');
    });
  });
});