const packageJson = require('./package.json');
const { defaults: tsJestTransform } = require('ts-jest/presets');

module.exports = {
  displayName: packageJson.name,
  preset: 'ts-jest',
  testEnvironment: 'node',
  transform: {
    ...tsJestTransform.transform,
  },
  testPathIgnorePatterns: ['/node_modules/'],
  testMatch: ['<rootDir>/tests/**/*.spec.ts'],
};
