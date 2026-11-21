const v1 = require('./jest.config.js');

module.exports = {
  ...v1,
  displayName: 'h3 in a Nitro app',
  testMatch: ['<rootDir>/tests/install/*.spec.ts'],
  testTimeout: 300000,
};
