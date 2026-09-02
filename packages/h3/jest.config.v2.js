const base = require('./jest.base.js');

module.exports = {
  ...base,
  displayName: 'h3@2',
  extensionsToTreatAsEsm: ['.ts'],
  testEnvironmentOptions: { customExportConditions: ['node'] },
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        useESM: true,
        tsconfig: {
          esModuleInterop: true,
          lib: ['es2022', 'DOM'],
          module: 'esnext',
          strict: true,
          target: 'es2022',
          resolveJsonModule: true,
          skipLibCheck: true,
          types: ['node', 'jest'],
        },
      },
    ],
  },
  moduleNameMapper: { '^h3$': 'h3-v2', '^h3/(.*)$': 'h3-v2/$1' },
};
