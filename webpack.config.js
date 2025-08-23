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

// Main process configuration - REMOVED: Now using tsc directly via tsconfig.main.json
// The main and preload scripts are compiled with TypeScript compiler to avoid bundling issues
// See tsconfig.main.json and tsconfig.preload.json for compilation settings
/*
const mainConfig = {
  mode: process.env.NODE_ENV || 'development',
  target: 'electron-main',
  entry: {
    main: './app/main/main.ts',
    preload: './app/main/preload.ts'
  },
  output: {
    path: path.resolve(__dirname, 'dist/app'),
    filename: (pathData) => {
      return pathData.chunk.name === 'preload' ? 'preload/preload.js' : 'main/[name].js';
    },
    libraryTarget: 'commonjs2'
  },
  externals: function(context, request, callback) {
    // Keep electron external
    if (request === 'electron') {
      return callback(null, 'commonjs2 ' + request);
    }
    
    // Keep other native modules external
    if (['better-sqlite3', 'fs', 'path', 'crypto', 'os', 'child_process', 'buffer', 'stream', 'util', 'events', 'net', 'http', 'https', 'url', 'querystring', 'zlib'].includes(request)) {
      return callback(null, 'commonjs2 ' + request);
    }
    
    // Bundle everything else
    callback();
  },
  resolve: {
    extensions: ['.ts', '.tsx', '.js', '.jsx'],
    alias: {
      '@': path.resolve(__dirname),
      '@agent': path.resolve(__dirname, 'agent')
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
*/

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
      '@': path.resolve(__dirname),
      '@agent': path.resolve(__dirname, 'agent')
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
    }),
    // Ignore module-alias in production builds since webpack handles path resolution
    ...(process.env.NODE_ENV === 'production' ? [
      new webpack.IgnorePlugin({
        resourceRegExp: /^module-alias$/
      })
    ] : [])
  ],
  devtool: process.env.NODE_ENV === 'development' ? 'source-map' : false
};

// Renderer process configuration
const rendererConfig = {
  mode: process.env.NODE_ENV || 'development',
  target: 'web',
  entry: './app/renderer/renderer.tsx',
  output: {
    path: path.resolve(__dirname, 'dist/app/renderer'),
    filename: 'renderer.js',
    publicPath: './',
    environment: {
      module: true
    },
    library: {
      type: 'module'
    }
  },
  optimization: {
    splitChunks: false,
    runtimeChunk: false
  },
  experiments: {
    outputModule: true
  },
  resolve: {
    extensions: ['.ts', '.tsx', '.js', '.jsx'],
    alias: {
      '@': path.resolve(__dirname),
      '@agent': path.resolve(__dirname, 'agent')
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
              configFile: 'tsconfig.renderer.json',
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
  // No externals needed for sandboxed renderer
  externals: {},
  plugins: [
    new CopyRendererFilesPlugin(),
    new webpack.DefinePlugin({
      'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'development')
    })
  ],
  devtool: process.env.NODE_ENV === 'development' ? 'source-map' : false
};

// Export only backend and renderer configurations (main/preload now use tsc directly)
module.exports = [backendConfig, rendererConfig];