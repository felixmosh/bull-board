const { defaults: tsJest } = require('ts-jest/presets');
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  transform: {
    ...tsJest.transform,
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: {
          experimentalDecorators: true,
          emitDecoratorMetadata: true,
          esModuleInterop: true,
        },
      },
    ],
  },
  testMatch: ['<rootDir>/tests/**/*.spec.ts'],
  testTimeout: 30000,
};
