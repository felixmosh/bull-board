const pkg = require('./package.json');
const { defaults: tsJest } = require('ts-jest/presets');
module.exports = {
  displayName: pkg.name,
  preset: 'ts-jest',
  testEnvironment: 'node',
  transform: {
    ...tsJest.transform,
  },
  testMatch: ['<rootDir>/tests/**/*.spec.ts'],
  testTimeout: 30000,
};
