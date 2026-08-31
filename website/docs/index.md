---
pageType: home

hero:
  name: Bull-Board
  text: Dashboard for BullMQ, BullMQ Pro & Bull
  tagline: Point it at a Redis URL, or mount it in your own server. See queues, jobs, schedulers and logs. Pause, retry, clean and reschedule from one UI.
  image:
    src: /logo.svg
    alt: bull-board
  actions:
    - theme: brand
      text: Get Started
      link: /guide/introduction
    - theme: alt
      text: Try the demo
      link: /demo/
    - theme: alt
      text: View on GitHub
      link: https://github.com/felixmosh/bull-board

features:
  - icon: "⚡"
    title: Nothing to wire up
    details: "npx @bull-board/cli -r redis://localhost:6379, or the official Docker image. No install, no code."
  - icon: "🧩"
    title: Or mount it in your app
    details: Adapters for Express, Fastify, Koa, Hapi, NestJS, Hono, H3, Elysia, and Bun.
  - icon: "⏰"
    title: Schedulers and history
    details: Every repeatable job in one view. Opt-in throughput and latency history that outlives BullMQ's ring buffer.
  - icon: "🔒"
    title: Safe to share
    details: Read-only mode, per-request visibility guards for multi-tenant boards, and hooks for finer access control.
  - icon: "🎨"
    title: Make it yours
    details: shadcn-contract theme tokens for a full rebrand, and formatters that rewrite job data without touching your producers.
  - icon: "🐂"
    title: BullMQ v5 & v6, Pro, and Bull
    details: All three queue adapters ship in the core package, including v6 queues stored in PostgreSQL.
---
