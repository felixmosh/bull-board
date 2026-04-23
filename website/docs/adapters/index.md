# Adapters

One server adapter per framework. The core `@bull-board/api` package is shared. Pick your framework below.

::: tip
<a href="/bull-board/demo/" target="_blank" rel="noopener">Try the live demo ↗</a> first — all 9 adapters serve the same UI.
:::

## Adapter matrix

| Framework | Package | Docs |
|-----------|---------|------|
| Express | `@bull-board/express` | [Express →](/adapters/express) |
| Fastify | `@bull-board/fastify` | [Fastify →](/adapters/fastify) |
| NestJS | `@bull-board/nestjs` | [NestJS →](/adapters/nestjs) |
| Koa | `@bull-board/koa` | [Koa →](/adapters/koa) |
| Hapi | `@bull-board/hapi` | [Hapi →](/adapters/hapi) |
| Hono | `@bull-board/hono` | [Hono →](/adapters/hono) |
| H3 | `@bull-board/h3` | [H3 →](/adapters/h3) |
| Elysia | `@bull-board/elysia` | [Elysia →](/adapters/elysia) |
| Bun | `@bull-board/bun` | [Bun →](/adapters/bun) |

## Sails

No dedicated Sails adapter. Sails runs on Express, so use `@bull-board/express` inside a Sails controller. Working example: [`examples/with-sails`](https://github.com/felixmosh/bull-board/tree/master/examples/with-sails).

## Shape

Most adapters follow the same three steps:

1. Create a server adapter and set its base path (`setBasePath()`, or constructor options for Elysia).
2. Call `createBullBoard({ queues, serverAdapter })` with your queue adapters.
3. Register the adapter with your app (Express `app.use`, Fastify `app.register`, Bun spreads `getRoutes()` into `Bun.serve`, etc.).

Elysia and Bun are a bit different, the adapter pages show exactly what goes where.

See [Your first dashboard](/guide/your-first-dashboard) for a concrete Express walkthrough.
