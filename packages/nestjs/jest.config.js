const base = require('./jest.base.js');
const nestModuleNameMapper = require('./jest.nest-matrix.js');

module.exports = {
  ...base,
  displayName: 'nest@11',
  moduleNameMapper: nestModuleNameMapper(11),
  testMatch: ['**/tests/**/*.spec.ts'],
  testPathIgnorePatterns: ['/node_modules/', '[/\\\\]tests[/\\\\]native[/\\\\]'],
};
