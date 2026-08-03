const base = require('./jest.base.js');

module.exports = {
  ...base,
  displayName: 'bullmq@6',
  testMatch: ['<rootDir>/tests/bullmq-matrix/**/*.spec.ts'],
  // Subpaths are mapped too so the battery can read the resolved major out of
  // `bullmq/package.json` and fail loudly if this mapping ever stops applying.
  moduleNameMapper: { '^bullmq$': 'bullmq-v6', '^bullmq/(.*)$': 'bullmq-v6/$1' },
  globals: { BULLMQ_MAJOR: 6 },
};
