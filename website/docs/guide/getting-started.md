# Installation

Install the core `@bull-board/api` plus one adapter for your framework.

## Prerequisites

- Node.js 18+ or Bun 1.x
- A running Redis instance
- [Bull](https://github.com/OptimalBits/bull) or [BullMQ](https://docs.bullmq.io/) already set up in your app

::: tip Sharing an ioredis connection?
bull-board reads your existing Bull/BullMQ queues, so it inherits their Redis connection. If you construct BullMQ with a shared `ioredis` instance rather than a plain `{ host, port }`, BullMQ requires that connection to be created with `maxRetriesPerRequest: null`. This is a BullMQ requirement, not a bull-board one, but it's the most common setup snag. See the [BullMQ connection docs](https://docs.bullmq.io/guide/connections).
:::

## Install

Pick the adapter that matches your framework:

| Framework | Install command |
|-----------|-----------------|
| Express   | `npm install @bull-board/api @bull-board/express` |
| Fastify   | `npm install @bull-board/api @bull-board/fastify` |
| NestJS    | `npm install @bull-board/api @bull-board/nestjs` |
| Koa       | `npm install @bull-board/api @bull-board/koa` |
| Hapi      | `npm install @bull-board/api @bull-board/hapi` |
| Hono      | `npm install @bull-board/api @bull-board/hono` |
| H3        | `npm install @bull-board/api @bull-board/h3` |
| Elysia    | `npm install @bull-board/api @bull-board/elysia` |
| Bun       | `npm install @bull-board/api @bull-board/bun` |

## Next steps

- [Build your first dashboard](/guide/your-first-dashboard) for a framework-agnostic walkthrough.
- Or jump to your adapter: [Express](/server-adapters/express), [Fastify](/server-adapters/fastify), [Koa](/server-adapters/koa), [Hapi](/server-adapters/hapi), [NestJS](/server-adapters/nestjs), [Hono](/server-adapters/hono), [H3](/server-adapters/h3), [Elysia](/server-adapters/elysia), [Bun](/server-adapters/bun).
