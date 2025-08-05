const path = require('path');
const fs = require('fs');

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
    });
  }
}

// Main process configuration
const mainConfig = {
  mode: process.env.NODE_ENV || 'development',
  target: 'electron-main',
  entry: {
    'app/main/main': './app/main/main.ts',
    'app/main/preload': './app/main/preload.ts',
    'backend/server': './backend/server.ts',
    'agent/orchestrator/modelRouter': './agent/orchestrator/modelRouter.ts',
    'agent/memory/vectorStore': './agent/memory/vectorStore.ts',
    'agent/validators/piiFilter': './agent/validators/piiFilter.ts'
  },
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name].js',
    libraryTarget: 'commonjs2'
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
  externals: {
    'electron': 'commonjs2 electron',
    'sqlite3': 'commonjs2 sqlite3'
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
  entry: {
    'app/renderer/renderer': './app/renderer/renderer.tsx'
  },
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name].js'
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
    'electron': 'commonjs electron'
  },
  plugins: [
    new CopyRendererFilesPlugin()
  ],
  devtool: process.env.NODE_ENV === 'development' ? 'source-map' : false
};

// Export both configurations
module.exports = [mainConfig, rendererConfig];
