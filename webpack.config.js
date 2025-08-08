const path = require('path');
const fs = require('fs');
const webpack = require('webpack');

// Simple plugin to copy HTML and CSS files
class CopyRendererFilesPlugin {
  apply(compiler) {
    compiler.hooks.afterEmit.tap('CopyRendererFilesPlugin', () => {
      // Ensure renderer directory exists
      const rendererDir = path.join(__dirname, 'dist/app/renderer');
      if (!fs.existsSync(rendererDir)) {
        fs.mkdirSync(rendererDir, { recursive: true });
      }

      // Copy HTML file
      const htmlSrc = path.join(__dirname, 'app/renderer/index.html');
      const htmlDest = path.join(__dirname, 'dist/app/renderer/index.html');
      if (fs.existsSync(htmlSrc)) {
        fs.copyFileSync(htmlSrc, htmlDest);
        console.log('Copied index.html to dist/app/renderer/');
      }

      // Copy styles directory
      const stylesSrc = path.join(__dirname, 'app/renderer/styles');
      const stylesDest = path.join(__dirname, 'dist/app/renderer/styles');
      
      if (fs.existsSync(stylesSrc)) {
        if (!fs.existsSync(stylesDest)) {
          fs.mkdirSync(stylesDest, { recursive: true });
        }
        
        const files = fs.readdirSync(stylesSrc);
        files.forEach(file => {
          if (file.endsWith('.css')) {
            fs.copyFileSync(
              path.join(stylesSrc, file),
              path.join(stylesDest, file)
            );
          }
        });
        console.log('Copied CSS files to dist/app/renderer/styles/');
      }

      // Copy assets directory
      const assetsSrc = path.join(__dirname, 'assets');
      const assetsDest = path.join(__dirname, 'dist/assets');
      
      if (fs.existsSync(assetsSrc)) {
        if (!fs.existsSync(assetsDest)) {
          fs.mkdirSync(assetsDest, { recursive: true });
        }
        
        // Recursively copy assets
        const copyDir = (src, dest) => {
          if (!fs.existsSync(dest)) {
            fs.mkdirSync(dest, { recursive: true });
          }
          
          const files = fs.readdirSync(src);
          files.forEach(file => {
            const srcPath = path.join(src, file);
            const destPath = path.join(dest, file);
            
            if (fs.statSync(srcPath).isDirectory()) {
              copyDir(srcPath, destPath);
            } else {
              fs.copyFileSync(srcPath, destPath);
            }
          });
        };
        
        copyDir(assetsSrc, assetsDest);
        console.log('Copied assets to dist/assets/');
      }
    });
  }
}

// Main process configuration
const mainConfig = {
  mode: process.env.NODE_ENV || 'development',
  target: 'electron-main',
  entry: {
    main: './app/main/main.ts',
    preload: './app/main/preload.ts'
  },
  output: {
    path: path.resolve(__dirname, 'dist/app/main'),
    filename: '[name].js',
    libraryTarget: 'commonjs2'
  },
  externals: {
    'electron': 'commonjs2 electron',
    'better-sqlite3': 'commonjs2 better-sqlite3',
    'fs': 'commonjs2 fs',
    'path': 'commonjs2 path',
    'crypto': 'commonjs2 crypto',
    'os': 'commonjs2 os',
    'child_process': 'commonjs2 child_process',
    'buffer': 'commonjs2 buffer',
    'stream': 'commonjs2 stream',
    'util': 'commonjs2 util',
    'events': 'commonjs2 events',
    'net': 'commonjs2 net',
    'http': 'commonjs2 http',
    'https': 'commonjs2 https',
    'url': 'commonjs2 url',
    'querystring': 'commonjs2 querystring',
    'zlib': 'commonjs2 zlib'
  },
  resolve: {
    extensions: ['.ts', '.tsx', '.js', '.jsx'],
    alias: {
      '@': path.resolve(__dirname)
    }
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: [
          {
            loader: 'ts-loader',
            options: {
              configFile: 'tsconfig.json',
              transpileOnly: true
            }
          }
        ],
        exclude: /node_modules/
      }
    ]
  },
  node: {
    __dirname: false,
    __filename: false
  },
  optimization: {
    minimize: false
  },
  plugins: [
    new webpack.DefinePlugin({
      'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'development')
    })
  ],
  devtool: process.env.NODE_ENV === 'development' ? 'source-map' : false
};

// Backend server configuration
const backendConfig = {
  mode: process.env.NODE_ENV || 'development',
  target: 'node',
  entry: './backend/server.ts',
  output: {
    path: path.resolve(__dirname, 'dist/backend'),
    filename: 'server.js',
    libraryTarget: 'commonjs2'
  },
  externals: {
    'better-sqlite3': 'commonjs2 better-sqlite3',
    'fs': 'commonjs2 fs',
    'path': 'commonjs2 path',
    'crypto': 'commonjs2 crypto',
    'os': 'commonjs2 os',
    'child_process': 'commonjs2 child_process',
    'buffer': 'commonjs2 buffer',
    'stream': 'commonjs2 stream',
    'util': 'commonjs2 util',
    'events': 'commonjs2 events',
    'net': 'commonjs2 net',
    'http': 'commonjs2 http',
    'https': 'commonjs2 https',
    'url': 'commonjs2 url'
  },
  resolve: {
    extensions: ['.ts', '.tsx', '.js', '.jsx'],
    alias: {
      '@': path.resolve(__dirname)
    }
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: [
          {
            loader: 'ts-loader',
            options: {
              configFile: 'tsconfig.json',
              transpileOnly: true
            }
          }
        ],
        exclude: /node_modules/
      }
    ]
  },
  node: {
    __dirname: false,
    __filename: false
  },
  optimization: {
    minimize: false
  },
  devtool: process.env.NODE_ENV === 'development' ? 'source-map' : false
};

// Renderer process configuration
const rendererConfig = {
  mode: process.env.NODE_ENV || 'development',
  target: 'electron-renderer',
  entry: './app/renderer/renderer.tsx',
  output: {
    path: path.resolve(__dirname, 'dist/app/renderer'),
    filename: 'renderer.js'
  },
  resolve: {
    extensions: ['.ts', '.tsx', '.js', '.jsx'],
    alias: {
      '@': path.resolve(__dirname)
    }
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: [
          {
            loader: 'ts-loader',
            options: {
              configFile: 'tsconfig.json',
              transpileOnly: true
            }
          }
        ],
        exclude: /node_modules/
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader']
      }
    ]
  },
  externals: {
    'electron': 'commonjs2 electron'
  },
  plugins: [
    new CopyRendererFilesPlugin(),
    new webpack.DefinePlugin({
      'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'development')
    })
  ],
  devtool: process.env.NODE_ENV === 'development' ? 'source-map' : false
};

// Export all three configurations
module.exports = [mainConfig, backendConfig, rendererConfig];