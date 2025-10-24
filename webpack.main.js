const path = require("path");
const webpack = require("webpack");
const nodeExternals = require("webpack-node-externals");

const isDev = process.env.NODE_ENV === "development";

module.exports = {
  mode: isDev ? "development" : "production",
  target: "electron-main",
  entry: {
    main: "./app/main/main.ts",
  },
  output: {
    path: path.resolve(__dirname, "dist/app/main"),
    filename: "[name].js",
    clean: true,
  },
  devtool: isDev ? "source-map" : false,
  watch: isDev,
  watchOptions: {
    ignored: /node_modules/,
    aggregateTimeout: 300,
    poll: 1000,
  },
  // This is the critical fix - use webpack-node-externals
  externals: [
    nodeExternals({
      allowlist: isDev
        ? [
            // Allow bundling of development dependencies that support HMR
            /webpack\/hot/,
            "webpack/hot/poll?1000",
          ]
        : [], // Don't bundle ANY node_modules in production
    }),
  ],
  resolve: {
    extensions: [".ts", ".tsx", ".js", ".jsx"],
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: {
          loader: "ts-loader",
          options: {
            transpileOnly: true,
            compilerOptions: {
              noEmit: false,
              sourceMap: isDev,
            },
          },
        },
        exclude: /node_modules/,
      },
      // Add support for hot reloading of main process modules
      ...(isDev
        ? [
            {
              test: /\.(ts|js)$/,
              exclude: /node_modules/,
              use: {
                loader: "babel-loader",
                options: {
                  presets: [
                    ["@babel/preset-env", { targets: { node: "18" } }],
                    "@babel/preset-typescript",
                  ],
                  plugins: [],
                },
              },
            },
          ]
        : []),
    ],
  },
  node: {
    __dirname: false,
    __filename: false,
  },
  plugins: [
    new webpack.DefinePlugin({
      "process.env.NODE_ENV": JSON.stringify(
        isDev ? "development" : "production",
      ),
      "process.env.BUILD_TARGET": JSON.stringify("main"),
    }),
    // HMR plugins for development
    ...(isDev
      ? [
          new webpack.HotModuleReplacementPlugin(),
          new webpack.NoEmitOnErrorsPlugin(),
        ]
      : []),
  ],
  optimization: {
    nodeEnv: isDev ? "development" : "production",
    minimize: !isDev,
  },
};
