const packageJson = require('./package.json');
const base = require('./jest.base.js');

module.exports = {
  ...base,
  displayName: packageJson.name,
  testMatch: ['<rootDir>/tests/**/*.spec.ts'],
  testPathIgnorePatterns: [...base.testPathIgnorePatterns, '<rootDir>/tests/bullmq-matrix/'],
};
