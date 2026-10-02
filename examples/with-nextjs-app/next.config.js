/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['@bull-board/api', '@bull-board/ui', '@bull-board/hono', 'bullmq'],

  // The tracer can't follow how @bull-board/api resolves the UI at runtime, so ship it manually (#444).
  outputFileTracingIncludes: {
    '/api/queues/*': ['./node_modules/@bull-board/ui/dist/**/*'],
  },

  // Monorepo: set the tracing root to the workspace root.
  // outputFileTracingRoot: require('path').join(__dirname, '../../'),
};

module.exports = nextConfig;
