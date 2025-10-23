// webpack.config.optimization.js
// Add this configuration to your existing webpack config

module.exports = {
  optimization: {
    splitChunks: {
      chunks: 'all',
      cacheGroups: {
        // Vendor bundle for common dependencies
        vendor: {
          test: /[\\/]node_modules[\\/]/,
          name: 'vendors',
          priority: 10,
          reuseExistingChunk: true
        },
        // Separate Three.js into its own bundle
        three: {
          test: /[\\/]node_modules[\\/]three[\\/]/,
          name: 'three',
          priority: 20,
          reuseExistingChunk: true
        },
        // Separate Supabase into its own bundle
        supabase: {
          test: /[\\/]node_modules[\\/]@supabase[\\/]/,
          name: 'supabase',
          priority: 20,
          reuseExistingChunk: true
        },
        // Separate React/ReactDOM
        react: {
          test: /[\\/]node_modules[\\/](react|react-dom)[\\/]/,
          name: 'react',
          priority: 20,
          reuseExistingChunk: true
        }
      }
    },
    runtimeChunk: 'single', // Extract runtime into separate file
    minimize: true,
    usedExports: true, // Tree shaking
  },

  // Performance hints
  performance: {
    hints: 'warning',
    maxEntrypointSize: 512000,
    maxAssetSize: 512000
  }
};
