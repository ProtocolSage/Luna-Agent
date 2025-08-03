const path = require('path');

module.exports = {
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
    libraryTarget: 'commonjs2',
    clean: true
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

