const packageJson = require('./package.json');
const base = require('./jest.base.js');

// Everything outside the BullMQ version matrix, run once against the plain `bullmq`
// devDependency. The matrix directory is excluded here and owned by the two version
// projects instead, so those specs are not run a third time against an unpinned major.
module.exports = {
  ...base,
  displayName: packageJson.name,
  testMatch: ['<rootDir>/tests/**/*.spec.ts'],
  testPathIgnorePatterns: [...base.testPathIgnorePatterns, '<rootDir>/tests/bullmq-matrix/'],
};
