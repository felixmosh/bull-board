# Next.js (App Router) example

bull-board in a Next.js App Router app using the `@bull-board/hono` adapter, deployable to Vercel. The dashboard is one optional catch-all route handler: `app/api/queues/[[...path]]/route.ts`.

## Run it

```bash
docker compose up -d        # Redis on localhost:6379
yarn install
yarn dev                    # http://localhost:3000
yarn worker                 # second terminal, processes jobs
```

- Dashboard: http://localhost:3000/api/queues
- Add a job: http://localhost:3000/api/add?title=Example

The dashboard has no auth here. Add some before exposing it — see the [basic auth recipe](https://github.com/felixmosh/bull-board/blob/master/website/docs/recipes/basic-auth.md).

## Deploying to Vercel

`@bull-board/api` resolves the UI assets through `eval(require.resolve(...))`, which Next's file tracer can't follow — so the assets get dropped from the serverless function and you hit `Cannot find module '@bull-board/ui/package.json'`. [`next.config.js`](./next.config.js) fixes it with `serverExternalPackages` and `outputFileTracingIncludes`; the [Next.js & Vercel recipe](https://github.com/felixmosh/bull-board/blob/master/website/docs/recipes/nextjs.md) explains why. In a monorepo, also set `outputFileTracingRoot` (commented in the config).

## Workers

BullMQ workers can't run in serverless functions, so `worker.ts` runs as its own process — locally via `yarn worker`, in production on something that stays up. Vercel serves only the dashboard and the job-producing routes.
