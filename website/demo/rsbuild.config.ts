import { defineConfig } from '@rsbuild/core';
import { pluginNodePolyfill } from '@rsbuild/plugin-node-polyfill';

export default defineConfig({
  plugins: [pluginNodePolyfill()],
  source: {
    entry: { index: './src/main.ts' },
  },
  html: {
    template: './index.ejs',
    templateParameters: {
      basePath: '/bull-board/demo/',
      title: 'Bull-Board Demo',
      favIconDefault: 'favicon.ico',
      favIconAlternative: 'favicon-32x32.png',
      uiConfig: JSON.stringify({
        boardTitle: 'Bull-Board Demo',
        boardLogo: { path: 'logo.svg', width: 32, height: 32 },
        environment: { label: 'Demo', color: '#f59f00', textColor: '#000' },
        showMetrics: true,
        pollingInterval: { showSetting: true },
        sortQueues: true,
        miscLinks: [],
        hideDocsLink: false,
      }),
    },
  },
  resolve: {
    alias: {
      bullmq: false,
    },
  },
  output: {
    cleanDistPath: true,
  },
  server: {
    port: 5174,
    base: '/bull-board/demo/',
  },
  dev: {
    writeToDisk: true,
  },
});
