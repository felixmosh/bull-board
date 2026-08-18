const { defaults: tsJestTransform } = require('ts-jest/presets');

module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  transform: {
    ...tsJestTransform.transform,
  },
  testPathIgnorePatterns: ['/node_modules/'],
  testTimeout: 30000,
};
