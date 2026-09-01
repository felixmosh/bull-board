# Recipes

Short, code-first walkthroughs for common setups. Each recipe is a page; each page ties back to a runnable example in the repo.

Most recipes link into the <a href="/bull-board/demo/" target="_blank" rel="noopener">live demo</a> so you can see the shape before porting it.

## Recipes

| Task | Recipe | Adapters shown |
|------|--------|----------------|
| Protect the dashboard with basic auth | [Add basic auth](/recipes/basic-auth) | Express, Fastify, Hapi, NestJS |
| Defend against CSRF on destructive actions | [CSRF protection](/recipes/csrf-protection) | Express |
| Run several dashboards in one app | [Multiple dashboards](/recipes/multiple-dashboards) | Express |
| Add or remove queues after startup | [Manage queues at runtime](/recipes/manage-queues-at-runtime) | All |
| Show only a tenant's queues per request | [Per-tenant visibility](/recipes/per-tenant-visibility) | Fastify |
| Allow some API actions and deny others, per requester | [Access control hooks](/recipes/access-control-hooks) | All |
| Surface worker logs and job flows in the UI | [Job logs and flows](/recipes/job-logs-and-flows) | All |
| Get notified when jobs fail | [Alerting on failed jobs](/recipes/alerting) | All |
| Change or force the polling interval | [Polling interval](/recipes/change-polling-interval) | All |
| Link jobs to your own admin pages | [External job URLs](/recipes/external-job-url) | All |
| Set global concurrency from the UI | [Global concurrency](/recipes/global-concurrency) | All |
| Cap a queue's throughput, or clear a limit a worker tripped | [Rate limits](/recipes/rate-limits) | BullMQ |
| Keep long-retention throughput history beyond BullMQ's ring buffer | [Historical metrics](/recipes/historical-metrics) | BullMQ |
| Recolour and rebrand the board for your own deployment | [Whitelabel theming](/recipes/whitelabel-theming) | Both |
| Run the board against BullMQ v6 queues stored in PostgreSQL | [PostgreSQL backend](/recipes/postgres-backend) | BullMQ |
| Deploy the dashboard on Next.js / Vercel | [Next.js & Vercel](/recipes/nextjs) | Hono, Express |
| Diagnose a dashboard that won't load | [Troubleshooting](/recipes/troubleshooting) | All |

Missing something? Open an issue. felixmosh is responsive, and good recipes become features.
