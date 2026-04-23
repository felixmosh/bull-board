# Production checklist

Quick gate before exposing the dashboard to real traffic.

## Auth

The dashboard has no built-in auth. Add one. See [Add basic auth](/recipes/basic-auth).

## CSRF

Destructive actions (retry, clean, pause, drain, obliterate) are state-changing requests. Behind a browser session, they're CSRF-reachable. See [CSRF protection](/recipes/csrf-protection).

## Read-only where possible

If the audience is "everyone with a login", most of them don't need `obliterate`. Mark queues [read-only](/recipes/read-only-mode) and enable retries only on the queues that need them.

## Multi-tenancy

Running a shared dashboard across tenants? Add a [visibility guard](/recipes/visibility-guard). Don't rely on "nobody will guess the queue name" — the name is in the URL.

## Polling interval

Default is 5 seconds. If the dashboard has many open tabs, every tab polls every queue. Cap it with `pollingInterval.forceInterval` or leave the picker on so users can dial it down. See [Polling interval](/recipes/change-polling-interval).

## Redis access

The dashboard connects directly to Redis via your queue instances. If Redis is reachable from the dashboard process, the dashboard can do anything Redis permits. Treat dashboard access as Redis access.

## Environment badge

Production and staging sharing a browser? Set `environment.label = 'production'` with a red color on the production instance. Small thing, saves a real outage.

```ts
serverAdapter.setUIConfig({
  environment: { label: 'production', color: '#cc0000' },
});
```

## Version pinning

The dashboard talks to your Bull / BullMQ instances. Mismatched versions across workers and the dashboard have bitten people (see issues #1074, #1088, #1097). Pin the same BullMQ across both.

## Logs

Workers that call `job.log()` will have their lines visible in the dashboard under each job's Logs tab. If you're wondering "what did this job do before it failed", that's the answer. See [Job logs and flows](/recipes/job-logs-and-flows).
