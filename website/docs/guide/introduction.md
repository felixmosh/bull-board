# Introduction

Bull-Board is a dashboard for [BullMQ](https://docs.bullmq.io/) and [Bull](https://github.com/OptimalBits/bull). It shows you what is in your queues and lets you act on it. You still use Bull or BullMQ to enqueue and process jobs, bull-board only visualises them.

Want to see it before installing? <a href="/bull-board/demo/" target="_blank" rel="noopener">Open the live demo</a>.

## Two ways to run it

Mount it into your existing HTTP server with one of the adapters, which is the usual choice for a dashboard your team keeps around, since it inherits your app's auth and can be configured in code.

Or run it standalone against a Redis URL, with no app involved at all:

```sh
npx @bull-board/cli -r redis://localhost:6379
```

That is the quicker path for looking at a queue locally, evaluating bull-board, or watching queues whose workers live in a repo you are not editing (or in another language entirely). See the [CLI guide](/guide/cli) and [Run with Docker](/guide/docker).

## What you get

- A React dashboard for your queues: counts, jobs, logs, live updates.
- Adapters for Express, Fastify, Koa, Hapi, NestJS, Hono, H3, Elysia, Bun.
- Every repeatable job in a [schedulers view](/guide/exploring-the-dashboard), and opt-in [throughput and latency history](/recipes/historical-metrics) that outlives BullMQ's own ring buffer.
- Per-queue read-only mode, formatters, external job URLs, a visibility guard for multi-tenant setups, and [hooks](/recipes/access-control-hooks) for finer-grained access control.
- Self-hosted, no telemetry. Runs on your machines, talks to your own datastore.
- BullMQ v5 and v6, including [v6 queues stored in PostgreSQL](/recipes/postgres-backend).

## Next steps

- [Install bull-board](/guide/getting-started) and wire it into your framework.
- [Build your first dashboard](/guide/your-first-dashboard) for an end-to-end walkthrough.
- [Explore the dashboard](/guide/exploring-the-dashboard) for a tour of what the UI actually does.
