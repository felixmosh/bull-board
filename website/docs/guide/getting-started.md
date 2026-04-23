# Installation

Install the core `@bull-board/api` plus one adapter for your framework.

## Prerequisites

- Node.js 18+ or Bun 1.x
- A running Redis instance
- [Bull](https://github.com/OptimalBits/bull) or [BullMQ](https://docs.bullmq.io/) already set up in your app

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
- Or jump to your adapter: [Express](/adapters/express), [Fastify](/adapters/fastify), [Koa](/adapters/koa), [Hapi](/adapters/hapi), [NestJS](/adapters/nestjs), [Hono](/adapters/hono), [H3](/adapters/h3), [Elysia](/adapters/elysia), [Bun](/adapters/bun).
