/* eslint-disable @typescript-eslint/no-var-requires */

const path = require('path')
const webpack = require('webpack')
const MiniCssExtractPlugin = require('mini-css-extract-plugin')
const HtmlWebpackPlugin = require('html-webpack-plugin')
const ForkTsCheckerWebpackPlugin = require('fork-ts-checker-webpack-plugin')

const basePath = '<%= basePath %>'
const isProd = process.env.NODE_ENV === 'production'

module.exports = {
  mode: 'development',
  bail: true,
  devtool: isProd ? false : 'eval-cheap-module-source-map',
  entry: ['./src/ui/index.tsx'],
  output: {
    path: path.resolve(__dirname, './static'),
    filename: `bundle${isProd ? '.[contenthash]' : ''}.js`,
    publicPath: `${basePath}/static/`,
  },
  resolve: {
    extensions: ['.ts', '.tsx', '.js', '.jsx'],
  },
  module: {
    rules: [
      {
        test: /\.js$/,
        loader: 'babel-loader',
        options: { presets: ['react-app'] },
      },
      {
        test: /\.css$/,
        use: [
          process.env.NODE_ENV !== 'production'
            ? 'style-loader'
            : MiniCssExtractPlugin.loader,
          'css-loader',
        ],
      },
      {
        test: /\.ts(x?)$/,
        exclude: /node_modules/,
        use: [
          {
            loader: 'ts-loader',
            options: {
              transpileOnly: true,
              compilerOptions: {
                sourceMap: !isProd,
              },
            },
          },
        ],
      },
    ],
  },
  plugins: [
    new MiniCssExtractPlugin({
      filename: '[name].[contenthash].css',
    }),
    new HtmlWebpackPlugin({
      filename: path.resolve(__dirname, './dist/ui/index.ejs'),
      template: './src/ui/index.ejs',
      templateParameters: {
        basePath,
      },
    }),
    new webpack.ContextReplacementPlugin(
      /highlight.js\/lib\/languages$/,
      /^.\/(json|javascript)$/,
    ),
    new ForkTsCheckerWebpackPlugin(),
  ],
  optimization: {
    splitChunks: {
      chunks: 'all',
      minSize: 20000,
      maxSize: 0,
      minChunks: 1,
      maxAsyncRequests: 30,
      maxInitialRequests: 30,
      automaticNameDelimiter: '~',
      cacheGroups: {
        defaultVendors: {
          test: /[\\/]node_modules[\\/]/,
          priority: -10,
        },
        default: {
          minChunks: 2,
          priority: -20,
          reuseExistingChunk: true,
        },
      },
    },
  },
}
