#!/usr/bin/env node

const webpack = require('webpack');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

/**
 * Production-ready build system
 * Features: TypeScript compilation, Code splitting, Error handling, Asset optimization
 */

const BUILD_MODES = {
  development: 'development',
  production: 'production',
  test: 'test'
};

class LunaBuildSystem {
  constructor() {
    this.mode = process.env.NODE_ENV || BUILD_MODES.development;
    this.isWatching = process.argv.includes('--watch');
    this.verbose = process.argv.includes('--verbose');
    this.analyze = process.argv.includes('--analyze');
    this.skipTypecheck = process.argv.includes('--skip-typecheck');
    
    this.buildId = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.startTime = Date.now();
    
    console.log(`\n🚀 Luna Agent Build System`);
    console.log(`📦 Mode: ${this.mode}`);
    console.log(`🔧 Build ID: ${this.buildId}`);
    console.log(`${this.isWatching ? '👁️  Watch mode enabled' : '🔨 Single build mode'}\n`);
  }

  async build() {
    try {
      // Pre-build checks
      await this.preBuildChecks();
      
      // Clean previous builds
      await this.cleanDistDirectory();
      
      // Type checking (unless skipped)
      if (!this.skipTypecheck) {
        await this.runTypeCheck();
      }
      
      // Copy static assets
      await this.copyStaticAssets();
      
      // Build main and renderer processes
      await Promise.all([
        this.buildMainProcess(),
        this.buildRendererProcess()
      ]);
      
      // Post-build optimizations
      await this.postBuildOptimizations();
      
      // Generate build manifest
      await this.generateBuildManifest();
      
      const buildTime = Date.now() - this.startTime;
      console.log(`\n✅ Build completed successfully in ${buildTime}ms`);
      console.log(`📁 Output directory: dist/`);
      
      if (this.analyze) {
        await this.analyzeBundles();
      }
      
    } catch (error) {
      console.error(`\n❌ Build failed:`, error);
      process.exit(1);
    }
  }

  async preBuildChecks() {
    console.log('🔍 Running pre-build checks...');
    
    // Check Node.js version
    const nodeVersion = process.version;
    const requiredNode = '18.0.0';
    
    if (!this.compareVersions(nodeVersion.slice(1), requiredNode)) {
      throw new Error(`Node.js ${requiredNode}+ required, found ${nodeVersion}`);
    }
    
    // Check required files exist
    const requiredFiles = [
      'package.json',
      'tsconfig.json',
      'app/main/main.ts',
      'app/renderer/renderer.tsx'
    ];
    
    for (const file of requiredFiles) {
      if (!fs.existsSync(file)) {
        throw new Error(`Required file missing: ${file}`);
      }
    }
    
    // Check environment variables
    await this.checkEnvironmentVariables();
    
    // Verify dependencies
    await this.verifyDependencies();
    
    console.log('✅ Pre-build checks passed');
  }

  async checkEnvironmentVariables() {
    const envFile = '.env';
    if (fs.existsSync(envFile)) {
      console.log('🔑 Environment file found');
      
      // Warn about missing important variables
      const envContent = fs.readFileSync(envFile, 'utf8');
      const warnings = [];
      
      if (!envContent.includes('OPENAI_API_KEY') && !process.env.OPENAI_API_KEY) {
        warnings.push('OPENAI_API_KEY not configured');
      }
      
      if (!envContent.includes('ANTHROPIC_API_KEY') && !process.env.ANTHROPIC_API_KEY) {
        warnings.push('ANTHROPIC_API_KEY not configured');
      }
      
      if (warnings.length > 0) {
        console.log('⚠️  Environment warnings:', warnings.join(', '));
      }
    } else {
      console.log('⚠️  No .env file found - using system environment variables');
    }
  }

  async verifyDependencies() {
    try {
      const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
      const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };
      
      // Check for critical dependencies
      const criticalDeps = [
        'electron',
        'react',
        'typescript',
        'webpack'
      ];
      
      for (const dep of criticalDeps) {
        if (!deps[dep]) {
          throw new Error(`Critical dependency missing: ${dep}`);
        }
      }
      
      console.log('📦 Dependencies verified');
    } catch (error) {
      throw new Error(`Dependency verification failed: ${error.message}`);
    }
  }

  async cleanDistDirectory() {
    console.log('🧹 Cleaning dist directory...');
    
    if (fs.existsSync('dist')) {
      fs.rmSync('dist', { recursive: true, force: true });
    }
    
    fs.mkdirSync('dist', { recursive: true });
    fs.mkdirSync('dist/app', { recursive: true });
    fs.mkdirSync('dist/app/main', { recursive: true });
    fs.mkdirSync('dist/app/renderer', { recursive: true });
    
    console.log('✅ Dist directory cleaned');
  }

  async runTypeCheck() {
    console.log('🔍 Running TypeScript type check...');
    
    try {
      execSync('npx tsc --noEmit', { 
        stdio: this.verbose ? 'inherit' : 'pipe',
        cwd: process.cwd()
      });
      console.log('✅ Type check passed');
    } catch (error) {
      console.error('❌ Type check failed');
      if (!this.verbose) {
        console.log('Run with --verbose to see details');
      }
      throw new Error('TypeScript compilation errors found');
    }
  }

  async copyStaticAssets() {
    console.log('📁 Copying static assets...');
    
    const assetsToCopy = [
      { src: 'app/renderer/index.html', dest: 'dist/app/renderer/index.html' },
      { src: 'assets', dest: 'dist/assets', recursive: true },
      { src: 'app/renderer/public', dest: 'dist/app/renderer/public', recursive: true, optional: true }
    ];
    
    for (const asset of assetsToCopy) {
      if (fs.existsSync(asset.src)) {
        this.copyRecursive(asset.src, asset.dest, asset.recursive);
      } else if (!asset.optional) {
        console.warn(`⚠️  Asset not found: ${asset.src}`);
      }
    }
    
    console.log('✅ Static assets copied');
  }

  async buildMainProcess() {
    console.log('🔨 Building main process...');
    
    const config = this.getMainProcessConfig();
    
    return new Promise((resolve, reject) => {
      const compiler = webpack(config);
      
      const callback = (err, stats) => {
        if (err) {
          console.error('❌ Main process build error:', err);
          return reject(err);
        }
        
        if (stats.hasErrors()) {
          console.error('❌ Main process build errors:');
          stats.compilation.errors.forEach(error => {
            console.error(error.message);
          });
          return reject(new Error('Main process compilation errors'));
        }
        
        if (stats.hasWarnings() && this.verbose) {
          console.warn('⚠️  Main process build warnings:');
          stats.compilation.warnings.forEach(warning => {
            console.warn(warning.message);
          });
        }
        
        console.log('✅ Main process build completed');
        resolve();
      };
      
      if (this.isWatching) {
        compiler.watch({
          aggregateTimeout: 300,
          poll: undefined,
        }, callback);
      } else {
        compiler.run(callback);
      }
    });
  }

  async buildRendererProcess() {
    console.log('🎨 Building renderer process...');
    
    const config = this.getRendererProcessConfig();
    
    return new Promise((resolve, reject) => {
      const compiler = webpack(config);
      
      const callback = (err, stats) => {
        if (err) {
          console.error('❌ Renderer process build error:', err);
          return reject(err);
        }
        
        if (stats.hasErrors()) {
          console.error('❌ Renderer process build errors:');
          stats.compilation.errors.forEach(error => {
            console.error(error.message);
          });
          return reject(new Error('Renderer process compilation errors'));
        }
        
        if (stats.hasWarnings() && this.verbose) {
          console.warn('⚠️  Renderer process build warnings:');
          stats.compilation.warnings.forEach(warning => {
            console.warn(warning.message);
          });
        }
        
        console.log('✅ Renderer process build completed');
        resolve();
      };
      
      if (this.isWatching) {
        compiler.watch({
          aggregateTimeout: 300,
          poll: undefined,
        }, callback);
      } else {
        compiler.run(callback);
      }
    });
  }

  getMainProcessConfig() {
    const nodeExternals = require('webpack-node-externals');
    
    return {
      mode: this.mode,
      target: 'electron-main',
      entry: './app/main/main.ts',
      output: {
        path: path.resolve(__dirname, 'dist/app/main'),
        filename: 'main.js',
        libraryTarget: 'commonjs2'
      },
      externals: [nodeExternals({
        allowlist: [/^(?!electron$)/, /^@/]
      })],
      module: {
        rules: [
          {
            test: /\.tsx?$/,
            use: {
              loader: 'ts-loader',
              options: {
                transpileOnly: true,
                compilerOptions: {
                  target: 'ES2020',
                  module: 'commonjs'
                }
              }
            },
            exclude: /node_modules/
          },
          {
            test: /\.node$/,
            use: 'node-loader'
          }
        ]
      },
      resolve: {
        extensions: ['.ts', '.tsx', '.js', '.jsx'],
        alias: {
          '@': path.resolve(__dirname, 'app'),
          '@shared': path.resolve(__dirname, 'shared'),
          '@types': path.resolve(__dirname, 'types')
        }
      },
      node: {
        __dirname: false,
        __filename: false
      },
      optimization: {
        minimize: this.mode === BUILD_MODES.production,
        nodeEnv: this.mode
      }
    };
  }

  getRendererProcessConfig() {
    const HtmlWebpackPlugin = require('html-webpack-plugin');
    const MiniCssExtractPlugin = require('mini-css-extract-plugin');
    const CopyWebpackPlugin = require('copy-webpack-plugin');
    const { BundleAnalyzerPlugin } = require('webpack-bundle-analyzer');
    
    const plugins = [
      new HtmlWebpackPlugin({
        template: 'app/renderer/index.html',
        filename: 'index.html',
        minify: this.mode === BUILD_MODES.production
      }),
      new MiniCssExtractPlugin({
        filename: this.mode === BUILD_MODES.production 
          ? 'css/[name].[contenthash].css'
          : 'css/[name].css'
      })
    ];
    
    // Add bundle analyzer in analyze mode
    if (this.analyze) {
      plugins.push(new BundleAnalyzerPlugin({
        analyzerMode: 'static',
        openAnalyzer: false,
        reportFilename: '../../../bundle-report.html'
      }));
    }
    
    return {
      mode: this.mode,
      target: 'electron-renderer',
      entry: {
        renderer: './app/renderer/renderer.tsx'
      },
      output: {
        path: path.resolve(__dirname, 'dist/app/renderer'),
        filename: this.mode === BUILD_MODES.production 
          ? 'js/[name].[contenthash].js'
          : 'js/[name].js',
        chunkFilename: this.mode === BUILD_MODES.production
          ? 'js/[name].[contenthash].chunk.js'
          : 'js/[name].chunk.js',
        clean: true
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
                  target: 'ES2020',
                  module: 'esnext',
                  jsx: 'react-jsx'
                }
              }
            },
            exclude: /node_modules/
          },
          {
            test: /\.css$/,
            use: [
              this.mode === BUILD_MODES.production 
                ? MiniCssExtractPlugin.loader 
                : 'style-loader',
              'css-loader'
            ]
          },
          {
            test: /\.(png|jpg|jpeg|gif|svg|ico)$/,
            type: 'asset/resource',
            generator: {
              filename: 'images/[name].[hash][ext]'
            }
          },
          {
            test: /\.(woff|woff2|eot|ttf|otf)$/,
            type: 'asset/resource',
            generator: {
              filename: 'fonts/[name].[hash][ext]'
            }
          },
          {
            test: /\.(mp3|wav|ogg)$/,
            type: 'asset/resource',
            generator: {
              filename: 'audio/[name].[hash][ext]'
            }
          }
        ]
      },
      resolve: {
        extensions: ['.ts', '.tsx', '.js', '.jsx'],
        alias: {
          '@': path.resolve(__dirname, 'app'),
          '@shared': path.resolve(__dirname, 'shared'),
          '@types': path.resolve(__dirname, 'types'),
          '@components': path.resolve(__dirname, 'app/renderer/components'),
          '@services': path.resolve(__dirname, 'app/renderer/services'),
          '@styles': path.resolve(__dirname, 'app/renderer/styles')
        },
        fallback: {
          "buffer": require.resolve("buffer"),
          "crypto": require.resolve("crypto-browserify"),
          "stream": require.resolve("stream-browserify"),
          "util": require.resolve("util"),
          "path": require.resolve("path-browserify")
        }
      },
      plugins,
      optimization: {
        minimize: this.mode === BUILD_MODES.production,
        splitChunks: {
          chunks: 'all',
          cacheGroups: {
            vendor: {
              test: /[\\/]node_modules[\\/]/,
              name: 'vendors',
              chunks: 'all',
              priority: 10
            },
            react: {
              test: /[\\/]node_modules[\\/](react|react-dom)[\\/]/,
              name: 'react',
              chunks: 'all',
              priority: 20
            }
          }
        },
        runtimeChunk: 'single'
      },
      devtool: this.mode === BUILD_MODES.production ? 'source-map' : 'eval-source-map'
    };
  }

  async postBuildOptimizations() {
    console.log('⚡ Running post-build optimizations...');
    
    if (this.mode === BUILD_MODES.production) {
      // Minify JSON files
      await this.minifyJsonFiles();
      
      // Generate service worker (if applicable)
      await this.generateServiceWorker();
      
      // Create integrity hashes
      await this.createIntegrityHashes();
    }
    
    console.log('✅ Post-build optimizations completed');
  }

  async minifyJsonFiles() {
    const glob = require('glob');
    
    const jsonFiles = glob.sync('dist/**/*.json');
    
    for (const file of jsonFiles) {
      try {
        const content = JSON.parse(fs.readFileSync(file, 'utf8'));
        fs.writeFileSync(file, JSON.stringify(content));
      } catch (error) {
        console.warn(`⚠️  Failed to minify ${file}:`, error.message);
      }
    }
  }

  async generateServiceWorker() {
    // Service worker for future web version
    const swContent = `
// Luna Agent Service Worker
const CACHE_NAME = 'luna-agent-${this.buildId}';
const STATIC_CACHE = [
  '/',
  '/index.html',
  '/js/renderer.js',
  '/css/renderer.css'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(STATIC_CACHE))
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => response || fetch(event.request))
  );
});
    `.trim();
    
    fs.writeFileSync(path.join('dist', 'sw.js'), swContent);
  }

  async createIntegrityHashes() {
    const crypto = require('crypto');
    const glob = require('glob');
    
    const files = glob.sync('dist/**/*.{js,css}');
    const integrity = {};
    
    for (const file of files) {
      const content = fs.readFileSync(file);
      const hash = crypto.createHash('sha384').update(content).digest('base64');
      const relativePath = path.relative('dist', file);
      integrity[relativePath] = `sha384-${hash}`;
    }
    
    fs.writeFileSync(
      path.join('dist', 'integrity.json'), 
      JSON.stringify(integrity, null, 2)
    );
  }

  async generateBuildManifest() {
    console.log('📋 Generating build manifest...');
    
    const manifest = {
      buildId: this.buildId,
      timestamp: new Date().toISOString(),
      mode: this.mode,
      version: this.getPackageVersion(),
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      buildTime: Date.now() - this.startTime,
      features: {
        voice: true,
        security: true,
        database: true,
        streaming: true,
        multiProvider: true
      },
      integrity: this.mode === BUILD_MODES.production 
        ? JSON.parse(fs.readFileSync(path.join('dist', 'integrity.json'), 'utf8'))
        : null
    };
    
    fs.writeFileSync(
      path.join('dist', 'build-manifest.json'), 
      JSON.stringify(manifest, null, 2)
    );
    
    console.log('✅ Build manifest generated');
  }

  async analyzeBundles() {
    console.log('📊 Bundle analysis report generated: bundle-report.html');
    
    // Additional bundle stats
    const stats = this.calculateBundleStats();
    console.log('📦 Bundle Statistics:');
    console.log(`   Total size: ${this.formatBytes(stats.totalSize)}`);
    console.log(`   Chunks: ${stats.chunks}`);
    console.log(`   Assets: ${stats.assets}`);
  }

  calculateBundleStats() {
    const glob = require('glob');
    
    const files = glob.sync('dist/**/*', { nodir: true });
    let totalSize = 0;
    
    for (const file of files) {
      const stat = fs.statSync(file);
      totalSize += stat.size;
    }
    
    return {
      totalSize,
      chunks: glob.sync('dist/**/*.chunk.js').length,
      assets: files.length
    };
  }

  // Utility methods
  copyRecursive(src, dest, recursive = false) {
    if (!fs.existsSync(src)) return;
    
    const stat = fs.statSync(src);
    
    if (stat.isDirectory() && recursive) {
      fs.mkdirSync(dest, { recursive: true });
      const files = fs.readdirSync(src);
      
      for (const file of files) {
        this.copyRecursive(
          path.join(src, file), 
          path.join(dest, file), 
          true
        );
      }
    } else if (stat.isFile()) {
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(src, dest);
    }
  }

  compareVersions(version1, version2) {
    const v1parts = version1.split('.').map(Number);
    const v2parts = version2.split('.').map(Number);
    
    for (let i = 0; i < Math.max(v1parts.length, v2parts.length); i++) {
      const v1part = v1parts[i] || 0;
      const v2part = v2parts[i] || 0;
      
      if (v1part > v2part) return true;
      if (v1part < v2part) return false;
    }
    
    return true; // Equal versions
  }

  getPackageVersion() {
    try {
      const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
      return packageJson.version;
    } catch (error) {
      return '0.0.0';
    }
  }

  formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}

// Run build if this script is executed directly
if (require.main === module) {
  const buildSystem = new LunaBuildSystem();
  buildSystem.build().catch(error => {
    console.error('Build failed:', error);
    process.exit(1);
  });
}

module.exports = LunaBuildSystem;
