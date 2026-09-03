const base = require('./jest.base.js');
const nestModuleNameMapper = require('./jest.nest-matrix.js');

module.exports = {
  ...base,
  displayName: 'nest@11',
  moduleNameMapper: nestModuleNameMapper(11),
};
