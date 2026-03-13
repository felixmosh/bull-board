const packageJson = require('./package.json');

module.exports = {
  displayName: packageJson.name,
  preset: 'ts-jest',
  testEnvironment: 'node',
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { diagnostics: false }],
  },
  testPathIgnorePatterns: ['/node_modules/'],
  testMatch: ['<rootDir>/tests/**/*.spec.ts'],
  moduleNameMapper: {
    '^@morpho-org/bull-board-api(.*)$': '<rootDir>$1',
    '^@morpho-org/bull-board-express(.*)$': '<rootDir>/../express$1',
  },
};
