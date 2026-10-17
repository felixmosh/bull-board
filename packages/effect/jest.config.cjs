// Effect 4 ships as ESM only, so this suite runs as an ESM project
// (see `jest.config.v12.js` in packages/nestjs for the same setup).
const pkg = require('./package.json');

module.exports = {
  displayName: pkg.name,
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts'],
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        useESM: true,
        tsconfig: {
          module: 'esnext',
          target: 'es2022',
          esModuleInterop: true,
          types: ['node', 'jest'],
        },
      },
    ],
  },
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  testMatch: ['<rootDir>/tests/**/*.spec.ts'],
  testTimeout: 30000,
};
