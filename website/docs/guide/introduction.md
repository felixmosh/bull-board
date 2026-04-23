# Introduction

bull-board is a dashboard for [Bull](https://github.com/OptimalBits/bull) and [BullMQ](https://docs.bullmq.io/). It mounts into your existing HTTP server and shows you what's in Redis. You still use Bull or BullMQ to enqueue and process jobs, bull-board only visualises them.

Want to see it before installing? <a href="/bull-board/demo/" target="_blank" rel="noopener">Open the live demo ↗</a>.

## What you get

- A React dashboard for your queues: counts, jobs, logs, live updates.
- Adapters for Express, Fastify, Koa, Hapi, NestJS, Hono, H3, Elysia, Bun.
- Per-queue read-only mode, formatters, external job URLs, and a visibility guard for multi-tenant setups.
- Self-hosted, no telemetry. Runs inside your app, talks to your Redis.

## Next steps

- [Install bull-board](/guide/getting-started) and wire it into your framework.
- [Build your first dashboard](/guide/your-first-dashboard) for an end-to-end walkthrough.
