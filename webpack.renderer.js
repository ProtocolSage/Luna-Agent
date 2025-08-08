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
    });
  }
}

module.exports = {
  mode: 'production',
  target: 'electron-renderer',
  entry: './app/renderer/renderer.tsx',
  output: {
    path: path.resolve(__dirname, 'dist/app/renderer'),
    filename: 'renderer.js'
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
      'process.env.NODE_ENV': JSON.stringify('production'),
      'process.env': JSON.stringify({})
    })
  ]
};