const packageJson = require('./package.json');

module.exports = {
  name: packageJson.name,
  displayName: packageJson.name,
  preset: 'ts-jest',
  testEnvironment: 'node',
  globals: {
    'ts-jest': {
      diagnostics: false, // https://huafu.github.io/ts-jest/user/config/diagnostics
    },
  },
  testPathIgnorePatterns: ['/node_modules/'],
  testMatch: ['<rootDir>/tests/**/*.spec.ts'],
};
