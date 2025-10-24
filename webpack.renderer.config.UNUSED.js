const path = require("path");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const CopyWebpackPlugin = require("copy-webpack-plugin");

module.exports = {
  mode: "production",
  target: "electron-renderer",
  entry: "./app/renderer/renderer.js", // Create a minimal JS entry point
  output: {
    path: path.resolve(__dirname, "dist/app/renderer"),
    filename: "renderer.js",
    libraryTarget: "commonjs2",
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: "ts-loader",
        exclude: /node_modules/,
      },
      {
        test: /\.css$/,
        use: ["style-loader", "css-loader", "postcss-loader"],
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
  externals: {
    electron: "commonjs electron",
  },
  plugins: [
    new CopyWebpackPlugin({
      patterns: [
        {
          from: path.resolve(__dirname, "app/renderer/index.html"),
          to: path.resolve(__dirname, "dist/app/renderer/index.html"),
        },
      ],
    }),
  ],
};
