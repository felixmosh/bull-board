/* eslint-disable @typescript-eslint/no-var-requires */

const path = require('path')
const webpack = require('webpack')

module.exports = {
  mode: 'production',
  bail: true,
  devtool: false,
  entry: ['./src/ui/index.js'],
  output: {
    path: path.resolve(__dirname, './static'),
    filename: 'bundle.js',
  },
  module: {
    rules: [
      {
        test: /\.js$/,
        loader: 'babel-loader',
        options: { presets: ['react-app'] },
      },
      { test: /\.css$/, use: ['style-loader', 'css-loader'] },
    ],
  },
  plugins: [
    new webpack.ContextReplacementPlugin(
      /highlight.js\/lib\/languages$/,
      /^.\/(json|javascript)$/,
    ),
  ],
}
