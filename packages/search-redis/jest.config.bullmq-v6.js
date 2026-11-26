const base = require('./jest.base.js');

module.exports = {
  ...base,
  displayName: 'bullmq@6',
  testMatch: ['<rootDir>/tests/bullmq-matrix/**/*.spec.ts'],
  moduleNameMapper: { '^bullmq$': 'bullmq-v6', '^bullmq/(.*)$': 'bullmq-v6/$1' },
  globals: { BULLMQ_MAJOR: 6 },
};
