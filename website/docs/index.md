---
pageType: home

hero:
  name: Bull-Board
  text: Dashboard for BullMQ & Bull
  tagline: Plug it into your server. See queues, jobs, logs. Pause, retry, clean from one UI.
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
  - icon: "\uD83E\uDDE9"
    title: Works with your stack
    details: Adapters for Express, Fastify, Koa, Hapi, NestJS, Hono, H3, Elysia, and Bun.
  - icon: "\uD83D\uDD12"
    title: Read-only mode
    details: Share the dashboard without giving anyone a retry button.
  - icon: "\uD83C\uDFE2"
    title: Multi-tenant
    details: Scope queue visibility per request with a visibility guard.
  - icon: "\uD83C\uDFA8"
    title: Formatters
    details: Rewrite how job data is shown without touching your producers.
  - icon: "\u26A1"
    title: BullMQ & Bull
    details: Both queue adapters ship in the core package.
  - icon: "\uD83D\uDCE6"
    title: Self-hosted
    details: Runs in your app, talks to your Redis. No telemetry, no third parties.
---

<figure style="text-align: center; margin: 3rem auto; max-width: 900px;">
  <img src="/screenshots/dashboard-overview.png" alt="bull-board dashboard showing 13 queues grouped by emails, billing, reports, and notifications with per-state counts" style="border-radius: 8px; box-shadow: var(--vp-shadow-3); width: 100%;" />
  <figcaption style="margin-top: 0.75rem; font-size: 0.9rem; opacity: 0.7;">Queues, jobs, metrics, logs.</figcaption>
</figure>

## Explore the docs

- New? Read the [Introduction](/guide/introduction), then [Installation](/guide/getting-started).
- Know your stack? Go to your adapter: [Express](/server-adapters/express), [Fastify](/server-adapters/fastify), [NestJS](/server-adapters/nestjs), [Hono](/server-adapters/hono), or [any of the others](/server-adapters/).
- Already wired up? See [UIConfig](/configuration/ui-config), [read-only mode](/recipes/read-only-mode), [visibility guard](/recipes/visibility-guard), [formatters](/recipes/formatters).
