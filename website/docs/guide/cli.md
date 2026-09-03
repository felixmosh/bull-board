# Standalone CLI

Sometimes you don't want to wire bull-board into an app at all, you just want to look at a Redis instance. `@bull-board/cli` does that: point it at a Redis URL and it finds the Bull and BullMQ queues stored there, then serves the same dashboard UI you'd get from any server adapter.

```sh
npx @bull-board/cli -r redis://localhost:6379
```

It needs Node.js 20 or newer. That starts the dashboard on `http://127.0.0.1:3000` and opens it in a browser. This is a tool for local development, evaluating bull-board before wiring it into your app, or looking at a queue on infrastructure you've tunnelled to. It is not a replacement for mounting the adapter in your own server: there's no auto-login, no framework-level auth to inherit, and every option has to be passed on the command line, an env var, or a config file instead of code.

## Discovery

On startup the CLI scans Redis for keys matching `<prefix>:<queue-name>:meta` (BullMQ) and `<prefix>:<queue-name>:id` (Bull) under each configured prefix, and builds a real `Queue` instance for every queue it finds. The default prefix is `bull`, which is what Bull and BullMQ both use unless you've changed it yourself. If your queues use a different prefix, pass `--prefix`.

By default it rescans every 10 seconds, so a queue created after the dashboard started still shows up without a restart. Pass `--scan-interval 0` to scan once at startup and stop.

If you'd rather skip discovery entirely, `--queues` takes an explicit, comma separated list of queue names to serve. The CLI still has to work out whether each one is Bull or BullMQ, but it no longer scans Redis for anything else under the prefix.

## When Redis isn't reachable

The dashboard still opens even if Redis is down or the URL is wrong. Instead of a dead terminal, `npx @bull-board/cli` serves a diagnostic page at the same URL, explaining what it tried to connect to, the underlying error, and the likely cause: Redis isn't running, the port is wrong (6379 is the default), it's in a container whose port isn't published, it needs credentials, or it needs TLS and therefore a `rediss://` URL. A `--user`/`--password` you've set still guards this page: the URL it names is never served to a request without the right credentials.

The process stays alive and keeps retrying every 3 seconds. The page polls its own status and reloads on its own the moment Redis answers, switching to the real dashboard with no restart and no second command.

That healing only applies before the first successful connection. Once the dashboard is live, it stays live for the rest of the process, even if Redis goes away later: the diagnostic page does not come back, and the dashboard's own API requests simply stop returning until Redis is reachable again. Ctrl-C still works during that window; the CLI's shutdown is bounded so it never hangs waiting on a dead connection.

A second, rarer page shows up if the CLI reaches Redis but something after that fails for a reason that has nothing to do with connectivity, such as an ACL-restricted user that can authenticate but not run `SCAN`. That page names the real error too, but does not promise a retry, since reconnecting again would not fix it; restart the CLI once the underlying problem is addressed.

For scripts and CI, retrying forever is the wrong default: they want a non-zero exit code, not a process that waits indefinitely. Pass `--no-retry` and the CLI prints the error and exits 1 as soon as the first connection attempt fails, without ever opening a port.

## Options

```
Usage:
  bull-board [options]
  npx @bull-board/cli [options]

Options:
  -r, --redis <url>       Redis connection URL          [redis://localhost:6379]
  -p, --port <port>       Port to listen on             [3000]
      --host <address>    Interface to bind             [127.0.0.1]
      --prefix <list>     Comma separated key prefixes  [bull]
      --queues <list>     Use these queue names instead of discovering
      --scan-interval <s> Seconds between rescans, 0 to scan once  [10]
      --base-path <path>  Serve the dashboard under a path prefix
      --read-only         Disable every destructive action
      --user <name>       Basic auth user (requires --password)
      --password <pass>   Basic auth password (requires --user)
      --board-title <s>   Dashboard title
      --history           Record and serve long-retention metrics history
      --history-retention-days <n>
                          Days of history to keep            [90]
      --config <file>     Path to a config file
      --browser <command> Command to open the browser with     [$BROWSER]
      --no-open           Do not open a browser
      --no-retry          Exit if Redis is unreachable instead of retrying
  -h, --help              Show this help
  -v, --version           Show the version
```

## Environment variables

Every flag has an environment variable equivalent, so you can configure the CLI in a container or a systemd unit without a command line to edit:

| Flag | Environment variable |
|---|---|
| `--redis` | `BULL_BOARD_REDIS_URL` |
| `--port` | `BULL_BOARD_PORT` |
| `--host` | `BULL_BOARD_HOST` |
| `--prefix` | `BULL_BOARD_PREFIX` |
| `--queues` | `BULL_BOARD_QUEUES` |
| `--scan-interval` | `BULL_BOARD_SCAN_INTERVAL` |
| `--base-path` | `BULL_BOARD_BASE_PATH` |
| `--read-only` | `BULL_BOARD_READ_ONLY` |
| `--user` | `BULL_BOARD_USER` |
| `--password` | `BULL_BOARD_PASSWORD` |
| `--board-title` | `BULL_BOARD_BOARD_TITLE` |
| `--history` | `BULL_BOARD_HISTORY` |
| `--history-retention-days` | `BULL_BOARD_HISTORY_RETENTION_DAYS` |
| `--no-open` | `BULL_BOARD_OPEN` (set to `false` to skip the browser; `--no-open` always wins) |
| `--no-retry` | `BULL_BOARD_NO_RETRY` |
| `--browser` | `BULL_BOARD_BROWSER`, then `BROWSER` |
| `--config` | `BULL_BOARD_CONFIG` |

Settings resolve in this order: a command line flag wins, then the matching environment variable, then the config file, then the built-in default. That applies field by field, so you can set a Redis URL in the environment and still override just the port with a flag on one particular run.

`--browser` picks the command used to open the dashboard. Three things can name it, and they win in this order: `--browser` on the command line, then `BULL_BOARD_BROWSER`, then a plain exported `$BROWSER`. `BULL_BOARD_BROWSER` exists so you can set one for the CLI without touching `$BROWSER` globally. With none of them set, the CLI falls back to the platform opener: `open` on macOS, `start` on Windows, `xdg-open` elsewhere.

A `browser` key in the config file sits below all three, because the config file is the last step in the resolution order above. That is worth knowing: an exported `$BROWSER` left over from another tool silently overrides a `browser` you set in the config file.

A command with arguments works too, for example `--browser 'open -a Safari'`. The value is split on whitespace and the URL is appended as the last argument, and it never goes through a shell, on any platform, Windows included.

Because the split is on whitespace, a single path that contains spaces does not survive it. The common macOS form `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`, and CRA's `BROWSER="google chrome"`, both break: every word after the first is treated as an argument to a command that does not exist at that path. It does not quietly fall back to the platform opener either. It fails to spawn, exactly as naming any other uninstalled command would, and the CLI prints "Could not open a browser automatically" and leaves you to open the URL yourself.

`--no-open` skips opening a browser at all, whatever `--browser` or `$BROWSER` say.

## Config file

For anything more than a couple of flags, use a config file. Without `--config`, the CLI looks for `bull-board.config.mjs`, `.js`, `.cjs`, or `.json` in the current directory, in that order. `.cjs` and `.json` are always read as CommonJS/JSON; a plain `.js` file is read as CommonJS first and retried as ESM if that fails, so either `module.exports` or `export default` works there.

```js
// bull-board.config.js
module.exports = {
  redis: 'redis://localhost:6379',
  prefix: ['bull', 'tenant-a'],
  scanInterval: 15,
  uiConfig: {
    boardTitle: 'Ops Dashboard',
    hideDocsLink: true,
  },
  queues: {
    'payment-webhooks': { readOnlyMode: true },
  },
};
```

`uiConfig` is the same object you'd pass to `createBullBoard({ options: { uiConfig } })` in code, see the [UIConfig reference](/configuration/ui-config) for the full set of fields. Board-wide title, logo, locale, and so on all live there, not at the top level of the config file.

`queues` is dual purpose: an array (`queues: ['emails', 'webhooks']`) is equivalent to `--queues`, a comma-free explicit list that skips discovery. An object, as above, instead sets per-queue [`QueueAdapterOptions`](/queue-adapters/bullmq) overrides keyed by queue name, the same options you'd pass to `new BullMQAdapter(queue, options)` directly. A queue's own `readOnlyMode: true` always wins even when the board as a whole isn't read-only, but it can't turn read-only mode back off for a single queue once `--read-only` is set globally. A field can't do both jobs in the same file: pick the array form to restrict which queues are served, or the object form to configure the ones discovery finds.

## Basic auth

`--user` and `--password` add HTTP basic auth in front of the dashboard. Both are required together:

```sh
npx @bull-board/cli -r redis://localhost:6379 --user admin --password secret --host 0.0.0.0
```

This is enough for a queue you've tunnelled to or a small internal box. It is not the layered, session-aware auth described in [Add basic auth](/recipes/basic-auth), which covers login flows and framework-integrated auth for an app you're embedding the dashboard into.

## Historical metrics

BullMQ's own metrics are a per-minute ring buffer capped at `maxDataPoints`, so the throughput chart can't look back further than that buffer reaches. `--history` turns on the long-retention path from the [historical metrics recipe](/recipes/historical-metrics) without wiring `@bull-board/metrics` into an app of your own:

```sh
npx @bull-board/cli -r redis://localhost:6379 --history
```

That registers `RedisMetricsHistoryProvider` on the Redis connection the dashboard already holds, so every queue chart gains a 60m / 7d / 30d / 90d range selector and a cross-queue "Metrics history" page shows up in the sidebar. It flips `showMetrics` on too, because the range selector lives inside the per-queue chart and that chart doesn't render without it.

It also writes. A `MetricsRecorder` runs in the CLI process and once a minute copies each queue's completed and failed counters into long-retention buckets, then samples wait time, run time and the age of the oldest waiting job. The recorder follows discovery rather than a fixed list: a queue that shows up between rescans starts recording on the next tick, and one that disappears stops. No restart either way.

`--history-retention-days` sets how long history is kept, 90 days by default. It moves the hourly and daily windows only and leaves minute-level detail at 7 days, since that tier holds essentially all the bytes. Per-tier retention, the snapshot interval and turning latency sampling off go in the config file under a `history` key:

```js
// bull-board.config.js
module.exports = {
  redis: 'redis://localhost:6379',
  history: {
    enabled: true,
    retention: { minutes: 7, hours: 90, days: 90 },
    latency: false,
    snapshotIntervalMs: 60000,
  },
};
```

### What it writes

Recording writes to the same Redis your queues live in, under the `bull-board:metrics:` namespace, and never touches a key Bull or BullMQ owns. Redis TTLs enforce retention, so there's nothing to prune by hand. [Storage footprint](/recipes/historical-metrics#storage-footprint) has the measured numbers; the short version is roughly 1.1 MB per queue for the counters at the default retention plus about 250 KB for latency, and an idle queue costs nothing.

`--read-only` stops the writing and keeps the reading, so the board serves whatever another process has recorded. That's what you want when your workers already run a `MetricsRecorder` of their own and the CLI is only there to look at the result. The config file can ask for the opposite with `history: { record: true }` alongside `--read-only`, for a board that mustn't touch your queues but does own its history.

Running several instances with `--history` at once is safe. The minute upsert applies a delta against the value already stored rather than adding to it, so a minute recorded twice still counts once, and latency sampling takes a short per-queue lease, so only one process scans a given queue on a given tick.

### When the charts stay empty

Completed and failed history is copied out of BullMQ's own metrics buffer, which stays empty unless your workers were built with metrics enabled:

```ts
new Worker(name, processor, {
  connection,
  metrics: { maxDataPoints: MetricsTime.ONE_WEEK },
});
```

The CLI warns about this at startup when no discovered queue has any metrics data, because otherwise a queue whose workers never enabled metrics looks exactly like an idle one. Latency and queue age need nothing from your workers, since they're read from sorted sets BullMQ maintains anyway. One exception there: a queue using `removeOnComplete: true` has its jobs deleted before the next tick can read them, so it never accumulates latency data.

This is BullMQ only. Bull v3 has no native metrics to snapshot, and BullMQ v6 queues backed by PostgreSQL aren't discoverable from the CLI in the first place.

## Docker

The CLI also ships as an image, `ghcr.io/felixmosh/bull-board`, so a container next to your Redis needs no Node on the host and doesn't re-resolve the package from npm every time it starts:

```sh
docker run --rm -p 127.0.0.1:3000:3000 \
  -e BULL_BOARD_USER=admin -e BULL_BOARD_PASSWORD=secret \
  ghcr.io/felixmosh/bull-board --redis redis://host.docker.internal:6379
```

The entrypoint is the CLI, so every flag and variable on this page works there too. [Run with Docker](/guide/docker) covers the tags, a Compose file, mounting a config file, and putting it behind a reverse proxy.

## Queues written by something other than Node

BullMQ has an official [Python package](https://python-bullmq.readthedocs.io/), and gets written to from Go, Ruby, and other languages over the raw Redis protocol, since the job format is just a set of Redis keys, not a Node API. Those teams have never had a way to use bull-board, because every server adapter assumes a Node HTTP app to mount into. The CLI doesn't have that assumption: it scans Redis for the same keys regardless of what wrote them, and builds a `Queue` instance the same way whether the producer was `bullmq` or `python-bullmq`.

The caveat is the same one that applies everywhere else in bull-board: the dashboard can only show what Bull and BullMQ store in Redis. A producer that doesn't write jobs in the format either library expects may show up incompletely, or not render some fields at all.

## Driving it from a script or an agent

The CLI serves the same JSON API the UI itself calls, so a shell script or an agent debugging a stuck job can query it instead of reading Redis keys by hand or writing a throwaway script:

```sh
npx @bull-board/cli -r redis://localhost:6379 --port 3000 --no-open &
curl -s http://127.0.0.1:3000/api/queues | jq '.queues[] | {name, counts, isPaused}'
```

```json
{
  "name": "Emails.Transactional.PasswordReset",
  "counts": {
    "active": 0,
    "completed": 500,
    "delayed": 6,
    "failed": 171,
    "paused": 0,
    "prioritized": 0,
    "waiting": 0,
    "waiting-children": 0
  },
  "isPaused": false
}
```

`--no-open` skips the browser launch, which matters in a script or a headless agent session where there's nothing to open a browser on. `--port` pins the port so the caller knows where to send the request instead of parsing it out of stdout.

## What it doesn't do yet

Discovery only reads Redis. BullMQ v6 queues backed by PostgreSQL aren't found or servable through the CLI; use a server adapter in your own app for those, see the [PostgreSQL backend recipe](/recipes/postgres-backend).

`--prefix` also doesn't take wildcards. A queue's Redis key and its name can both contain colons, so there's no reliable way to guess where a wildcard prefix ends and the queue name begins. List the prefixes you need explicitly instead, for example `--prefix bull,tenant-a,tenant-b`.
