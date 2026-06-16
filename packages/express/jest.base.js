const { defaults: tsJest } = require('ts-jest/presets');
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  transform: { ...tsJest.transform },
  testMatch: ['<rootDir>/tests/**/*.spec.ts'],
  testTimeout: 30000,
};
