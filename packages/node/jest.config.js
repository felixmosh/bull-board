const pkg = require('./package.json');

module.exports = {
  displayName: pkg.name,
  preset: 'ts-jest',
  testEnvironment: 'node',
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: { types: ['node', 'jest'] } }],
  },
  testMatch: ['**/tests/**/*.spec.ts'],
  testTimeout: 15000,
};
