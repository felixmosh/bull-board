const packageJson = require('./package.json');

// Maps `@bull-board/api*` to `src/` so coverage is measured against source rather
// than the `dist/` the tests import (a naive `jest --coverage` reports 0% otherwise).
// `isolatedModules` skips type-checking the src-vs-dist `BaseAdapter` clash; runtime
// is duck-typed. Scoped to this run only -- `yarn test` keeps full type-checking.
module.exports = {
  displayName: `${packageJson.name} (coverage)`,
  testEnvironment: 'node',
  testPathIgnorePatterns: ['/node_modules/'],
  testMatch: ['<rootDir>/tests/**/*.spec.ts'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { isolatedModules: true }],
  },
  moduleNameMapper: {
    '^@bull-board/api/dist/(.*)$': '<rootDir>/src/$1',
    '^@bull-board/api/bullMQAdapter$': '<rootDir>/src/queueAdapters/bullMQ',
    '^@bull-board/api/bullMQProAdapter$': '<rootDir>/src/queueAdapters/bullMQPro',
    '^@bull-board/api/bullAdapter$': '<rootDir>/src/queueAdapters/bull',
    '^@bull-board/api$': '<rootDir>/src/index',
  },
  collectCoverage: true,
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.d.ts'],
  coverageDirectory: '<rootDir>/coverage',
  coverageReporters: ['text', 'text-summary', 'lcov'],
};
