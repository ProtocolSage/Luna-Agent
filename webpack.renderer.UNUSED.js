const path = require('path');
const webpack = require('webpack');
const CopyPlugin = require('copy-webpack-plugin');

const isDev = process.env.NODE_ENV === 'development';

module.exports = {
  mode: isDev ? 'development' : 'production',
  target: 'electron-renderer',
  entry: {
    renderer: './app/renderer/renderer.tsx',
    voice: './app/renderer/services/VoiceService.ts',
    analytics: './app/renderer/services/analytics/PerformanceMonitor.ts'
  },
  output: {
    path: path.resolve(__dirname, 'dist/app/renderer'),
    filename: isDev ? '[name].js' : '[name].[contenthash].js',
    chunkFilename: isDev ? '[name].chunk.js' : '[name].[contenthash].chunk.js',
    publicPath: './',
    clean: true,
  },
  devtool: isDev ? 'source-map' : undefined,
  resolve: {
    extensions: ['.ts', '.tsx', '.js', '.jsx'],
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
              noEmit: false,
            },
          },
        },
        exclude: /node_modules/,
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader'],
      },
    ],
  },
  optimization: {
    splitChunks: {
      chunks: 'all',
      cacheGroups: {
        vendor: {
          test: /[\\/]node_modules[\\/]/,
          name: 'vendors',
          priority: 10,
          reuseExistingChunk: true,
        },
        voice: {
          test: /[\\/]services[\\/](Voice|STT|TTS)/,
          name: 'voice-services',
          priority: 20,
          reuseExistingChunk: true,
        },
        analytics: {
          test: /[\\/]services[\\/]analytics[\\/]/,
          name: 'analytics',
          priority: 15,
          reuseExistingChunk: true,
        },
        components: {
          test: /[\\/]components[\\/]/,
          name: 'components',
          priority: 5,
          reuseExistingChunk: true,
        },
        common: {
          name: 'common',
          minChunks: 2,
          priority: 0,
          reuseExistingChunk: true,
        },
      },
    },
    runtimeChunk: {
      name: 'runtime',
    },
    usedExports: true,
    sideEffects: false,
  },
  externals: {
    electron: 'commonjs2 electron',
  },
  plugins: [
    new CopyPlugin({
      patterns: [
        // Renderer HTML and styles
        { from: 'app/renderer/index.html', to: 'index.html' },
        { from: 'app/renderer/styles', to: 'styles' },

        // Wake word assets (copy from public folder)
        {
          from: 'app/renderer/public/assets',
          to: 'assets',
          globOptions: {
            ignore: ['**/.DS_Store']
          }
        },

        // VAD assets from node_modules
        { 
          from: 'node_modules/@ricky0123/vad-web/dist/vad.worklet.bundle.min.js', 
          to: 'assets/vad.worklet.bundle.min.js' 
        },
        { 
          from: 'node_modules/@ricky0123/vad-web/dist/silero_vad_v5.onnx', 
          to: 'assets/silero_vad.onnx' 
        },
        { 
          from: 'node_modules/@ricky0123/vad-web/dist/silero_vad_legacy.onnx', 
          to: 'assets/silero_vad_legacy.onnx' 
        },
      ],
    }),
    new webpack.DefinePlugin({
      'process.env.NODE_ENV': JSON.stringify(isDev ? 'development' : 'production'),
      'process.env.BUILD_TARGET': JSON.stringify('renderer'),
    }),
    // Bundle analyzer (only in development)
    ...(isDev && process.env.ANALYZE ? [
      new (require('webpack-bundle-analyzer').BundleAnalyzerPlugin)({
        analyzerMode: 'server',
        openAnalyzer: true,
      })
    ] : []),
  ],
};
