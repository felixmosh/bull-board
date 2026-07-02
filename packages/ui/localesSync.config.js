const fs = require('fs');
const path = require('path');

const localesFolder = './src/static/locales';
const primaryLanguage = 'en-US';

const secondaryLanguages = fs
  .readdirSync(path.resolve(__dirname, localesFolder))
  .filter((dir) => dir !== primaryLanguage)
  .sort();

module.exports = {
  primaryLanguage,
  secondaryLanguages,
  localesFolder,
  spaces: 2,
};
