const { defaults: tsJestTransform } = require('ts-jest/presets');

module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  transform: {
    ...tsJestTransform.transform,
  },
  testPathIgnorePatterns: ['/node_modules/'],
  testTimeout: 30000,
  // Bounds JEST_WORKER_ID to the logical databases `tests/connection.ts` maps it onto, which
  // throws if the two ever disagree. `jest.config.js` repeats it because Jest reads global
  // options from the root config only, ignoring them inside a `projects` entry.
  maxWorkers: 15,
};
