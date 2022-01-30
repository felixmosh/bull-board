const { CleanWebpackPlugin } = require('clean-webpack-plugin');
const CopyPlugin = require('copy-webpack-plugin');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const NodePolyfillPlugin = require('node-polyfill-webpack-plugin');
const path = require('path');
const webpack = require('webpack');

module.exports = {
  entry: ['./src/mocks.ts', './src/index.ts'],
  mode: 'development',
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
      {
        test: /\.lua$/,
        use: 'raw-loader',
      },
    ],
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js'],
    fallback: {
      child_process: false,
    },
    alias: {
      fs: 'memfs',
    },
  },
  externals: {
    ioredis: 'mockIORedis',
    'get-port': 'null',
  },
  output: {
    filename: 'static/live-demo.bundle.js',
    path: path.resolve(__dirname, 'dist'),
  },
  plugins: [
    new NodePolyfillPlugin(),
    new webpack.DefinePlugin({
      'process.env.FENGARICONF': 'void 0',
      'typeof process': JSON.stringify('undefined'),
    }),
    new CleanWebpackPlugin(),
    new CopyPlugin({
      patterns: [{ from: './node_modules/@bull-board/ui/dist/static', to: './static' }],
    }),
    new HtmlWebpackPlugin({
      title: 'Bull-board - Live Demo',
      template: './node_modules/@bull-board/ui/dist/index.ejs',
      scriptLoading: 'blocking',
      templateParameters: {
        basePath: '',
      },
    }),
  ],
};
