const packageJson = require('./package.json');

module.exports = {
  displayName: packageJson.name,
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  testTimeout: 15000,
  maxWorkers: 1,
  testPathIgnorePatterns: ['/node_modules/', '/dist/'],
  testMatch: ['<rootDir>/tests/**/*.spec.{ts,tsx}'],
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  moduleNameMapper: {
    '\\.(css|less|scss)$': 'identity-obj-proxy',
  },
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.test.json' }],
  },
};
