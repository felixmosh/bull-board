// Three projects: the existing suite against the plain `bullmq` devDependency, plus the
// version matrix run twice, once per supported BullMQ major. The matrix is what keeps the
// `^5.79.2 || ^6.0.0` peer range honest.
module.exports = {
  // Three projects at full width oversubscribe the machine, and BullMQ surfaces that as
  // "Connection is closed" unhandled errors while a suite is tearing down its Redis clients.
  // Capping total workers keeps concurrency near what the suite saw as a single project.
  maxWorkers: '50%',
  projects: [
    '<rootDir>/jest.config.default.js',
    '<rootDir>/jest.config.bullmq-v5.js',
    '<rootDir>/jest.config.bullmq-v6.js',
  ],
};
