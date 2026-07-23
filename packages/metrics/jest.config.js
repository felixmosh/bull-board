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
  testTimeout: 30000,
  // Suite runs against a shared real Redis, including the __global__ rollup hash
  // that every spec file writes into. Parallel Jest workers across spec files can
  // collide on that shared state. This is an integration suite bound by Redis I/O,
  // so serial execution costs little and removes cross-file races.
  maxWorkers: 1,
};
