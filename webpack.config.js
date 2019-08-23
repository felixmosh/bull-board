const path = require('path')

module.exports = {
  mode: 'production',
  bail: true,
  devtool: false,
  entry: ['./ui/index.js'],
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
}
