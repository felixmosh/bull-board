const path = require('path');
const { CleanWebpackPlugin } = require('clean-webpack-plugin');

const isProd = process.env.NODE_ENV === 'production';
const devServerPort = 8080;
const pkg = require('./package.json');

/** @type {import('@rspack/cli').RspackOptions} */
module.exports = {
  target: 'web',
  entry: {
    main: './src/index.tsx',
  },
  output: {
    path: path.resolve(__dirname, './dist/static'),
    filename: `[name]${!isProd ? '.[contenthash]' : ''}.js`,
    chunkFilename: `${!isProd ? '[contenthash]' : '[name]'}.chunk.js`,
  },
  builtins: {
    html: [
      {
        template: './src/index.ejs',
        filename: '../index.ejs',
        publicPath: 'static/',
        // minify: isProd,
      },
    ],
    css: {
      modules: {
        camelCaseOnly: true,
      },
    },
    react: {
      refresh: true,
    },
    define: {
      'process.env.APP_VERSION': JSON.stringify(pkg.version),
    },
    copy: {
      patterns: [{ from: './src/static/', to: './' }],
    },
  },
  module: {
    rules: [
      {
        test: /\.css$/,
        use: [
          {
            loader: 'postcss-loader',
            options: {
              postcssOptions: {
                plugins: [['postcss-preset-env']],
              },
            },
          },
        ],
        type: 'css/module',
      },
    ],
  },
  plugins: [new CleanWebpackPlugin({ cleanStaleWebpackAssets: false })],
  // devtool: isProd ? false : 'eval-cheap-module-source-map',
  devServer: {
    proxy: {
      '*': 'http://localhost:3000',
    },
    compress: true,
    hot: true,
    port: devServerPort,
    open: ['/ui'],
    devMiddleware: {
      writeToDisk: true,
    },
  },
};
