const { defaults: tsJestTransform } = require('ts-jest/presets');

module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  transform: {
    ...tsJestTransform.transform,
  },
  testPathIgnorePatterns: ['/node_modules/'],
  testTimeout: 30000,
  // Every spec wipes the whole `bull-board:metrics:` namespace on one shared Redis, so two
  // running at once delete each other's fixtures. `jest.config.js` repeats this because Jest
  // reads `maxWorkers` from the root config only when running `projects`.
  maxWorkers: 1,
};
