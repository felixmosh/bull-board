const pkg = require('./package.json');
module.exports = {
  displayName: pkg.name,
  preset: 'ts-jest',
  testEnvironment: 'node',
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: {
        esModuleInterop: true,
        lib: ['es2022', 'DOM'],
        module: 'CommonJS',
        strict: true,
        target: 'es2019',
        resolveJsonModule: true,
        skipLibCheck: true,
        types: ['node', 'jest'],
      },
    }],
  },
  testMatch: ['<rootDir>/tests/**/*.spec.ts'],
  testTimeout: 30000,
};
