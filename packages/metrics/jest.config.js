// See jest.base.js: the cap keeps JEST_WORKER_ID inside the range of logical databases
// `tests/connection.ts` hands out.
module.exports = {
  maxWorkers: 15,
  projects: ['<rootDir>/jest.config.default.js', '<rootDir>/jest.config.bullmq-v6.js'],
};
