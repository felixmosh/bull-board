import { defineConfig } from '@rsbuild/core';
import { pluginReact } from '@rsbuild/plugin-react';
import { pluginTypeCheck } from '@rsbuild/plugin-type-check';
import { I18NextHMRPlugin } from 'i18next-hmr/webpack';

import path from 'node:path';
import pkgJson from './package.json';

export default defineConfig({
  performance: {
    bundleAnalyze:
      process.env.BUNDLE_ANALYZE === 'true'
        ? { analyzerMode: 'static', openAnalyzer: true }
        : undefined,
  },
  source: {
    entry: {
      main: path.resolve(__dirname, './src/index.tsx'),
    },
    define: {
      'process.env.APP_VERSION': JSON.stringify(pkgJson.version),
    },
  },
  output: {
    cleanDistPath: true,
    copy: [{ from: './src/static/', to: './static', info: { hotModuleReplacement: false } }],
    assetPrefix: 'auto',
    target: 'web',
  },
  plugins: [pluginReact(), pluginTypeCheck()],
  tools: {
    htmlPlugin: {
      filename: 'index.ejs',
    },
    rspack: (config, { isDev }) => {
      config.output = config.output || {};
      config.output.hotUpdateMainFilename = 'static/hot/[runtime].[fullhash].hot-update.json';
      config.output.hotUpdateChunkFilename = 'static/hot/[id].[fullhash].hot-update.js';

      if (isDev) {
        config.plugins?.push(
          new I18NextHMRPlugin({ localesDir: path.join(__dirname, 'src/static/locales') })
        );
      }
    },
  },
  html: {
    template: path.resolve(__dirname, './src/index.ejs'),
    templateParameters: {
      basePath: '<%= basePath %>',
      uiConfig: '<%- uiConfig %>',
      title: '<%= title %>',
      favIconDefault: '<%= favIconDefault %>',
      favIconAlternative: '<%= favIconAlternative %>',
    },
    inject: 'body',
  },
  dev: {
    assetPrefix: 'auto',
    writeToDisk: true,
    hmr: true,
    liveReload: false,
    client: {
      host: '127.0.0.1',
      port: 9000,
    },
  },
  server: {
    open: {
      target: 'http://localhost:3000/ui',
      before: async () => {
        await new Promise((resolve) => setTimeout(resolve, 5000));
      },
    },
    port: 9000,
    proxy: {
      '*': 'http://127.0.0.1:3000',
    },
  },
});
