# Server Adapters

One server adapter per framework. The core `@bull-board/api` package is shared. Pick your framework below.

::: tip
<a href="/bull-board/demo/" target="_blank" rel="noopener">Try the live demo ↗</a> first — all 9 adapters serve the same UI.
:::

## Adapter matrix

| Framework | Package | Docs |
|-----------|---------|------|
| Express | `@bull-board/express` | [Express →](/server-adapters/express) |
| Fastify | `@bull-board/fastify` | [Fastify →](/server-adapters/fastify) |
| NestJS | `@bull-board/nestjs` | [NestJS →](/server-adapters/nestjs) |
| Koa | `@bull-board/koa` | [Koa →](/server-adapters/koa) |
| Hapi | `@bull-board/hapi` | [Hapi →](/server-adapters/hapi) |
| Hono | `@bull-board/hono` | [Hono →](/server-adapters/hono) |
| H3 | `@bull-board/h3` | [H3 →](/server-adapters/h3) |
| Elysia | `@bull-board/elysia` | [Elysia →](/server-adapters/elysia) |
| Bun | `@bull-board/bun` | [Bun →](/server-adapters/bun) |

## Sails

No dedicated Sails adapter. Sails runs on Express, so use `@bull-board/express` inside a Sails controller. Working example: [`examples/with-sails`](https://github.com/felixmosh/bull-board/tree/master/examples/with-sails).

## Next.js

No dedicated Next.js adapter. Mount bull-board inside a Next.js API route using the Hono adapter (App Router) or the Express adapter (Pages Router). The Vercel deployment needs a small bit of `next.config.js` — see [Next.js & Vercel](/recipes/nextjs) and the [`with-nextjs-app`](https://github.com/felixmosh/bull-board/tree/master/examples/with-nextjs-app) / [`with-nextjs-pages`](https://github.com/felixmosh/bull-board/tree/master/examples/with-nextjs-pages) examples.

## Shape

Most adapters follow the same three steps:

1. Create a server adapter and set its base path (`setBasePath()`, or constructor options for Elysia).
2. Call `createBullBoard({ queues, serverAdapter })` with your queue adapters.
3. Register the adapter with your app (Express `app.use`, Fastify `app.register`, Bun spreads `getRoutes()` into `Bun.serve`, etc.).

Elysia and Bun are a bit different, the adapter pages show exactly what goes where.

See [Your first dashboard](/guide/your-first-dashboard) for a concrete Express walkthrough.
