/* eslint-disable @typescript-eslint/no-var-requires */

const path = require('path')
const webpack = require('webpack')

module.exports = {
  mode: 'production',
  bail: true,
  devtool: false,
  entry: ['./src/ui/index.tsx'],
  output: {
    path: path.resolve(__dirname, './static'),
    filename: 'bundle.js',
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
        use: ['style-loader', 'css-loader'],
      },
      {
        test: /\.ts(x?)$/,
        exclude: /node_modules/,
        use: [{ loader: 'ts-loader' }],
      },
      {
        // All output '.js' files will have any sourcemaps re-processed by 'source-map-loader'.
        enforce: 'pre',
        test: /\.js$/,
        loader: 'source-map-loader',
      },
    ],
  },
  plugins: [
    new webpack.ContextReplacementPlugin(
      /highlight.js\/lib\/languages$/,
      /^.\/(json|javascript)$/,
    ),
  ],
}
