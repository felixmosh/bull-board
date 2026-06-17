/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['@bull-board/api', '@bull-board/ui', '@bull-board/express', 'bullmq'],

  // The tracer can't follow @bull-board/api's eval(require.resolve), so ship the UI manually (#444).
  outputFileTracingIncludes: {
    '/api/queues/*': ['./node_modules/@bull-board/ui/dist/**/*'],
  },

  // Monorepo: set the tracing root to the workspace root.
  // outputFileTracingRoot: require('path').join(__dirname, '../../'),
};

module.exports = nextConfig;
