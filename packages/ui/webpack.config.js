const path = require('path');
const webpack = require('webpack');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const ForkTsCheckerWebpackPlugin = require('fork-ts-checker-webpack-plugin');
const CssMinimizerPlugin = require('css-minimizer-webpack-plugin');
const ReactRefreshWebpackPlugin = require('@pmmmwh/react-refresh-webpack-plugin');
const { CleanWebpackPlugin } = require('clean-webpack-plugin');
const CopyPlugin = require('copy-webpack-plugin');
const { I18NextHMRPlugin } = require('i18next-hmr/webpack');
const { BundleAnalyzerPlugin } = require('webpack-bundle-analyzer');

const isProd = process.env.NODE_ENV === 'production';
const isAnalyze = process.env.ANALYZE === 'true';
const devServerPort = 9000;
const basePath = '<%= basePath %>';
const pkg = require('./package.json');

module.exports = {
  mode: 'development',
  bail: true,
  devtool: isProd ? false : 'eval-cheap-module-source-map',
  entry: ['./src/index.tsx'],
  output: {
    path: path.resolve(__dirname, './dist/static'),
    filename: `[name]${isProd ? '.[contenthash:10]' : ''}.js`,
    publicPath: `${!isProd ? `http://localhost:${devServerPort}/` : 'auto'}`,
    chunkFilename: '[contenthash:10].chunk.js',
  },
  resolve: {
    extensions: ['.ts', '.tsx', '.js', '.jsx'],
  },
  module: {
    rules: [
      {
        test: /\.css$/,
        use: [
          isProd ? MiniCssExtractPlugin.loader : 'style-loader',
          {
            loader: 'css-loader',
            options: {
              importLoaders: 1,
              modules: {
                auto: true,
                exportLocalsConvention: 'camelCaseOnly',
                localIdentName: isProd ? '[hash:base64:6]' : '[name]__[local]--[hash:base64:5]',
              },
            },
          },
          {
            loader: 'postcss-loader',
            options: {
              postcssOptions: {
                plugins: [['postcss-preset-env']],
              },
            },
          },
        ],
      },
      {
        test: /\.[jt]sx?$/,
        exclude: /node_modules/,
        use: [
          {
            loader: 'babel-loader',
            options: {
              plugins: [!isProd && require.resolve('react-refresh/babel')].filter(Boolean),
            },
          },
        ],
      },
    ],
  },
  optimization: {
    minimizer: [isProd && `...`, isProd && new CssMinimizerPlugin()].filter(Boolean),
    splitChunks: {
      hidePathInfo: true,
      cacheGroups: {
        vendor: {
          test: /node_modules/,
          chunks: 'initial',
          name: 'vendor',
          priority: 10,
        },
      },
    },
  },
  plugins: [
    new webpack.DefinePlugin({
      ['process.env.APP_VERSION']: JSON.stringify(pkg.version),
    }),
    new MiniCssExtractPlugin({
      filename: '[name].[contenthash:10].css',
      chunkFilename: '[contenthash:10].chunk.css',
    }),
    new HtmlWebpackPlugin({
      filename: path.resolve(__dirname, './dist/index.ejs'),
      template: './src/index.ejs',
      templateParameters: {
        basePath,
        uiConfig: '<%- uiConfig %>',
        title: '<%= title %>',
        favIconDefault: '<%= favIconDefault %>',
        favIconAlternative: '<%= favIconAlternative %>',
      },
      inject: 'body',
    }),
    new CleanWebpackPlugin({ cleanStaleWebpackAssets: false }),
    new CopyPlugin({
      patterns: [{ from: './src/static/', to: './' }],
    }),
    new ForkTsCheckerWebpackPlugin(),
    !isProd && new ReactRefreshWebpackPlugin(),
    !isProd && new I18NextHMRPlugin({ localesDir: path.join(__dirname, 'src/static/locales') }),
    isAnalyze && new BundleAnalyzerPlugin(),
  ].filter(Boolean),
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
