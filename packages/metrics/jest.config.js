// Suite runs against a shared real Redis, including the __global__ rollup hash that every
// spec file writes into. Parallel Jest workers across spec files can collide on that shared
// state. This is an integration suite bound by Redis I/O, so serial execution costs little
// and removes cross-file races.
module.exports = {
  maxWorkers: 1,
  projects: ['<rootDir>/jest.config.default.js', '<rootDir>/jest.config.bullmq-v6.js'],
};
