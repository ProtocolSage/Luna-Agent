// ===============================================================================
// 🔧 DEVELOPMENT RENDERER BUILD - webpack-dev-server
// ===============================================================================
// This is the SINGLE SOURCE OF TRUTH for development renderer builds
// Used by: npm run dev:renderer
// Serves: http://localhost:5173 for Electron development
// Production builds use: scripts/build-renderer.js (esbuild)
// ===============================================================================

const path = require("path");
const HtmlWebpackPlugin = require("html-webpack-plugin");

module.exports = {
  mode: "development",
  target: "web", // Use 'web' for dev server, not 'electron-renderer'
  entry: "./app/renderer/renderer.tsx",
  output: {
    path: path.resolve(__dirname, "dist/app/renderer"),
    filename: "renderer.js",
    publicPath: "/",
  },
  // Performance optimizations
  cache: {
    type: "filesystem",
    cacheDirectory: path.resolve(__dirname, ".webpack-cache/renderer"),
  },
  infrastructureLogging: { level: "warn" },
  devtool: "source-map", // Avoid eval-based source maps to prevent CSP issues
  watchOptions: { poll: 1000, ignored: /node_modules/ },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        loader: "esbuild-loader",
        options: {
          loader: "tsx",
          target: "es2020",
        },
        exclude: /node_modules/,
      },
      {
        test: /\.css$/,
        use: ["style-loader", "css-loader"],
      },
      {
        test: /\.(png|jpg|gif|svg|ico)$/,
        type: "asset/resource",
      },
    ],
  },
  resolve: {
    extensions: [".tsx", ".ts", ".js", ".jsx"],
    alias: {
      "@": path.resolve(__dirname),
      "@agent": path.resolve(__dirname, "agent"),
    },
  },
  devServer: {
    allowedHosts: "all",
    port: 5173,
    hot: true,
    historyApiFallback: true,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, PATCH, OPTIONS",
      "Access-Control-Allow-Headers":
        "X-Requested-With, content-type, Authorization",
    },
    static: [
      {
        directory: path.join(__dirname, "app/renderer/public"),
        publicPath: "/",
      },
      {
        directory: path.join(__dirname, "app/renderer"),
        publicPath: "/",
      },
    ],
    client: {
      overlay: {
        errors: true,
        warnings: false,
      },
    },
    setupMiddlewares: (middlewares, devServer) => {
      // Allow Electron to connect
      devServer.app.use((req, res, next) => {
        res.setHeader("Access-Control-Allow-Origin", "*");
        next();
      });
      return middlewares;
    },
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: path.resolve(__dirname, "app/renderer/index.html"),
      inject: true,
      scriptLoading: "module",
    }),
  ],
};
