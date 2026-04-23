import { cpSync, createReadStream, existsSync, rmSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitepress';
import { generateLlmsTxt } from './llms';

const configDir = dirname(fileURLToPath(import.meta.url));
const demoDistDir = resolve(configDir, '../../demo/dist');

const mimeByExt: Record<string, string> = {
  html: 'text/html',
  js: 'application/javascript',
  mjs: 'application/javascript',
  css: 'text/css',
  svg: 'image/svg+xml',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  ico: 'image/x-icon',
  json: 'application/json',
  map: 'application/json',
  woff: 'font/woff',
  woff2: 'font/woff2',
  ttf: 'font/ttf',
  txt: 'text/plain',
};

export default defineConfig({
  title: 'bull-board',
  description: 'Dashboard for Bull and BullMQ job queues.',
  base: '/bull-board/',
  lastUpdated: true,
  cleanUrls: true,
  ignoreDeadLinks: [/^\/demo(\/|$)/],
  head: [
    ['link', { rel: 'icon', href: '/bull-board/favicon.ico' }],
    ['meta', { name: 'theme-color', content: '#3c89e8' }],
  ],
  buildEnd(siteConfig) {
    generateLlmsTxt(siteConfig);

    const docsDemoOut = resolve(siteConfig.outDir, 'demo');
    if (existsSync(demoDistDir)) {
      if (existsSync(docsDemoOut)) rmSync(docsDemoOut, { recursive: true });
      cpSync(demoDistDir, docsDemoOut, { recursive: true });
      console.warn(`[docs] Copied interactive demo into ${docsDemoOut}`);
    } else {
      console.warn(
        `[docs] Skipping demo bundling: ${demoDistDir} does not exist. Run \`yarn workspace @bull-board/demo build\` first.`
      );
    }
  },
  vite: {
    plugins: [
      // Serve the pre-built demo bundle (website/demo/dist) from /bull-board/demo
      // during `vitepress dev`. The production build copies the same directory
      // via buildEnd above. Requires a prior `yarn workspace @bull-board/demo build`.
      {
        name: 'serve-demo-from-dist',
        apply: 'serve',
        configureServer(server) {
          server.middlewares.use('/bull-board/demo', (req, res, next) => {
            if (!existsSync(demoDistDir)) return next();
            let urlPath = (req.url ?? '/').split('?')[0];
            if (urlPath === '' || urlPath === '/') urlPath = '/index.html';

            const filePath = join(demoDistDir, urlPath);
            if (!filePath.startsWith(demoDistDir)) return next();

            const sendFile = (target: string, contentType?: string) => {
              if (contentType) res.setHeader('Content-Type', contentType);
              createReadStream(target).pipe(res);
            };

            const extOf = (p: string) => p.split('.').pop()?.toLowerCase();

            if (existsSync(filePath)) {
              const stat = statSync(filePath);
              if (stat.isDirectory()) {
                const idx = join(filePath, 'index.html');
                if (existsSync(idx)) return sendFile(idx, 'text/html');
                return next();
              }
              const ext = extOf(filePath);
              return sendFile(filePath, ext ? mimeByExt[ext] : undefined);
            }

            // SPA fallback: serve index.html for unknown paths so client-side
            // routes inside the demo still resolve.
            const indexPath = join(demoDistDir, 'index.html');
            if (existsSync(indexPath)) return sendFile(indexPath, 'text/html');
            return next();
          });
        },
      },
    ],
  },
  themeConfig: {
    logo: '/logo.svg',
    nav: [
      { text: 'Guide', link: '/guide/introduction' },
      { text: 'Recipes', link: '/recipes/' },
      { text: 'Adapters', link: '/adapters/' },
      { text: 'Reference', link: '/configuration/ui-config' },
    ],
    sidebar: [
      {
        text: 'Getting Started',
        collapsed: false,
        items: [
          { text: 'Introduction', link: '/guide/introduction' },
          { text: 'Installation', link: '/guide/getting-started' },
          { text: 'Your first dashboard', link: '/guide/your-first-dashboard' },
        ],
      },
      {
        text: 'Recipes',
        collapsed: false,
        items: [
          { text: 'Overview', link: '/recipes/' },
          { text: 'Add basic auth', link: '/recipes/basic-auth' },
          { text: 'CSRF protection', link: '/recipes/csrf-protection' },
          { text: 'Read-only mode', link: '/recipes/read-only-mode' },
          { text: 'Visibility guard', link: '/recipes/visibility-guard' },
          { text: 'Formatters', link: '/recipes/formatters' },
          { text: 'Multiple dashboards', link: '/recipes/multiple-dashboards' },
          { text: 'Per-tenant visibility', link: '/recipes/per-tenant-visibility' },
          { text: 'Job logs and flows', link: '/recipes/job-logs-and-flows' },
          { text: 'Polling interval', link: '/recipes/change-polling-interval' },
          { text: 'External job URLs', link: '/recipes/external-job-url' },
          { text: 'Global concurrency', link: '/recipes/global-concurrency' },
        ],
      },
      {
        text: 'Reference',
        collapsed: false,
        items: [
          { text: 'UIConfig', link: '/configuration/ui-config' },
          { text: 'Production checklist', link: '/configuration/production-checklist' },
        ],
      },
      {
        text: 'Adapters',
        collapsed: true,
        items: [
          { text: 'Overview', link: '/adapters/' },
          { text: 'Express', link: '/adapters/express' },
          { text: 'Fastify', link: '/adapters/fastify' },
          { text: 'Koa', link: '/adapters/koa' },
          { text: 'Hapi', link: '/adapters/hapi' },
          { text: 'NestJS', link: '/adapters/nestjs' },
          { text: 'Hono', link: '/adapters/hono' },
          { text: 'H3', link: '/adapters/h3' },
          { text: 'Elysia', link: '/adapters/elysia' },
          { text: 'Bun', link: '/adapters/bun' },
        ],
      },
    ],
    socialLinks: [{ icon: 'github', link: 'https://github.com/felixmosh/bull-board' }],
    search: {
      provider: 'local',
    },
    editLink: {
      pattern: 'https://github.com/felixmosh/bull-board/edit/master/website/docs/:path',
      text: 'Edit this page on GitHub',
    },
    footer: {
      message: 'Released under the MIT License.',
      copyright: `Copyright © 2019–${new Date().getFullYear()} felixmosh and contributors`,
    },
  },
});
