const path = require('path');
const webpack = require('webpack');

module.exports = {
  mode: 'production',
  target: 'electron-main',
  entry: './app/main/main.ts',
  output: {
    path: path.resolve(__dirname, 'dist/app/main'),
    filename: 'main.js',
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
    'axios': 'commonjs2 axios'
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
  },
  node: {
    __dirname: false,
    __filename: false
  },
  plugins: [
    new webpack.DefinePlugin({
      'process.env.NODE_ENV': JSON.stringify('production')
    })
  ]
};