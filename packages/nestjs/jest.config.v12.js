const base = require('./jest.base.js');
const nestModuleNameMapper = require('./jest.nest-matrix.js');

module.exports = {
  ...base,
  displayName: 'nest@12',
  extensionsToTreatAsEsm: ['.ts'],
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        useESM: true,
        tsconfig: {
          module: 'esnext',
          target: 'es2022',
          experimentalDecorators: true,
          emitDecoratorMetadata: true,
          esModuleInterop: true,
        },
      },
    ],
  },
  moduleNameMapper: {
    '^@bull-board/test-utils$': '<rootDir>/tests/esmTestUtils.ts',
    ...nestModuleNameMapper(12),
  },
};
