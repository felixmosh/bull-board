const pkg = require('./package.json');
module.exports = {
  displayName: pkg.name,
  preset: 'ts-jest',
  testEnvironment: 'node',
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: { types: ['node', 'jest'] } }],
    '^.+/mime/.*\\.js$': ['ts-jest', { allowJs: true, diagnostics: false }],
  },
  transformIgnorePatterns: ['/node_modules/(?!mime/)'],
  testMatch: ['<rootDir>/tests/**/*.spec.ts'],
  testTimeout: 30000,
};
