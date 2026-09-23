# Troubleshooting

> Applies to: all adapters.

The failure modes below account for most "it won't load" reports. Nearly all of them come down to one thing: the path bull-board thinks it's mounted at doesn't match the path the browser actually requests.

## The page loads but assets and API calls 404

You see the HTML, but the styles are missing and the network tab is full of 404s for `/static/...` and `/api/...`.

`setBasePath` and the path you mount the router at have to be the same string. bull-board bakes the base path into the HTML it serves, and the browser builds every asset and API URL from it. If they disagree, every follow-up request misses.

```ts
serverAdapter.setBasePath('/admin/queues');   // ← these two
app.use('/admin/queues', serverAdapter.getRouter());  // ← must match
```

Change one, change the other.

## Same 404s, but only behind a reverse proxy

Works on `localhost`, breaks once it's behind nginx / a load balancer / an ingress at a subpath.

The base path has to be the path the **browser** sees, not the internal one. If the proxy exposes the dashboard at `https://example.com/tools/queues` but forwards to your app at `/`, then `setBasePath('/tools/queues')`, the public path, and let the proxy route it. The rule is the same as above; the "mount path" is just whatever the outside world requests.

If the proxy strips the prefix before forwarding, either stop stripping it or set the base path to the stripped value, whichever keeps the browser's URL and the base path in agreement.

## Counts are right but every list is empty, behind a reverse proxy

The tabs show the right numbers, every queue and every status says it has no jobs, and Redis holds the jobs when you look.

The dashboard reads the open queue's jobs from `/api/queues?activeQueue=<name>&status=...`. Counts are built for every queue on every request, but the `jobs` array is only filled for the queue named in `activeQueue`. A proxy that drops the query string therefore leaves the counts intact and empties every list.

nginx does this when `proxy_pass` contains a variable. With a regex `location` that captures the path into `$1`, nginx sends exactly the URI you built and does not append the original query string:

```nginx
location ~ /queues/(.*) {
  proxy_pass http://127.0.0.1:3000/queues/$1;
}
```

Use a prefix location with a literal URI instead, which forwards the query string untouched:

```nginx
location ^~ /queues/ {
  proxy_pass http://127.0.0.1:3000/queues/;
}
```

If the regex form has to stay, append `$is_args$args` to the `proxy_pass` URI.

To confirm, request `<base-path>/api/queues?activeQueue=<name>` once against the Node process directly and once through the proxy. If `jobs` is filled in the first response and empty in the second, the proxy is at fault.

## `Cannot find module '@bull-board/ui/package.json'`

Thrown at startup, almost always under a bundler (Next.js/Vercel, esbuild, `ncc`, a Docker build that prunes `node_modules`).

bull-board locates the compiled UI with `eval(require.resolve('@bull-board/ui/package.json'))`. The `eval` is deliberate: it hides the require from bundlers so they don't try to inline the whole UI, but it also means bundlers don't know to ship those files. Two fixes: point bull-board at the UI directly with `options.uiBasePath`, and/or tell the bundler to include the files. The [Next.js & Vercel recipe](/recipes/nextjs) walks through both.

## Blank page, or a 500 on the dashboard root

If the response is a 500 rather than a 404, it's usually the missing-UI case above (the view can't render). A genuinely blank page with no failed requests is more often a strict **Content-Security-Policy** on the parent app blocking the dashboard's scripts or styles. Check the browser console for CSP violations and allow bull-board's `/static` origin if so.

## Buttons do nothing, or actions error after an upgrade

If retry/clean/pause started failing after you bumped a dependency, suspect a Bull / BullMQ version mismatch between your workers and the version bull-board resolves. Pin the same version across both. See [version pinning](/configuration/production-checklist#version-pinning).

## The Paused tab disappeared after upgrading to BullMQ v6

Working as intended. BullMQ v6 removed the paused job state, so a paused queue keeps its jobs in `waiting` and reports no paused count at all. The dashboard stops offering a tab that could only ever be empty, and shows those jobs under **Waiting** instead. The queue still shows its paused banner, and pause and resume still work. See [supported versions](/queue-adapters/bullmq#supported-versions).

## A destructive action returns 405

That's [read-only mode](/recipes/read-only-mode) doing its job. The queue was registered with `readOnlyMode: true` (or the action is gated by `allowRetries`). Intended, not a bug.

## "Retry all" says it skipped some ids, or a count is higher than the list

If every queue and every status shows the same gap behind a reverse proxy, check the [query string](#counts-are-right-but-every-list-is-empty-behind-a-reverse-proxy) first.

The status set holds ids whose job data is gone, so the dashboard has an id and nothing to show for it. Counts come from the set (a `ZCARD`), which is why the badge can read higher than the rows beneath it, and why retrying leaves it stuck above zero.

Redis is almost always the cause. BullMQ and Bull both require `maxmemory-policy noeviction`; under `allkeys-lru` or any other policy Redis evicts individual job hashes once memory fills, while the sets that point at them survive. Check with `redis-cli config get maxmemory-policy`, raise the instance's memory before switching the policy, or the writes that used to evict will start failing outright.

The leftover ids are not removed for you, since deleting datastore entries is more than a dashboard should do behind your back. They age out of `completed` as new jobs push them past `removeOnComplete`, and **Clean** removes them from any set, along with the real jobs in it.

## Still stuck

Open an issue on [felixmosh/bull-board](https://github.com/felixmosh/bull-board/issues) with your adapter, versions, and the mount/base-path setup. Most reports resolve to one of the above once the exact paths are on the table.
