# Recipes

Most recipes link into the <a href="/bull-board/demo/" target="_blank" rel="noopener">live demo ↗</a> so you can see the shape before porting it.

Short, code-first walkthroughs for common setups. Each recipe is a page; each page ties back to a runnable example in the repo.

## Recipes

| Task | Recipe | Adapters shown |
|------|--------|----------------|
| Protect the dashboard with basic auth | [Add basic auth](/recipes/basic-auth) | Express, Fastify, Hapi, NestJS |
| Defend against CSRF on destructive actions | [CSRF protection](/recipes/csrf-protection) | Express |
| Run several dashboards in one app | [Multiple dashboards](/recipes/multiple-dashboards) | Express |
| Show only a tenant's queues per request | [Per-tenant visibility](/recipes/per-tenant-visibility) | Fastify |
| Surface worker logs and job flows in the UI | [Job logs and flows](/recipes/job-logs-and-flows) | All |
| Change or force the polling interval | [Polling interval](/recipes/change-polling-interval) | All |
| Link jobs to your own admin pages | [External job URLs](/recipes/external-job-url) | All |
| Set global concurrency from the UI | [Global concurrency](/recipes/global-concurrency) | All |

Missing something? Open an issue. felixmosh is responsive, and good recipes become features.
