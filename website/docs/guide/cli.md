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

The dashboard still opens even if Redis is down or the URL is wrong. Instead of a dead terminal, `npx @bull-board/cli` serves a diagnostic page at the same URL, explaining what it tried to connect to, the underlying error, and the likely cause: Redis isn't running, the port is wrong (6379 is the default), it's in a container whose port isn't published, it needs credentials, or it needs [TLS](#tls). A `--user`/`--password` you've set still guards this page: the URL it names is never served to a request without the right credentials.

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
      --sentinel <list>   Comma separated sentinel host:port list, port [26379]
      --sentinel-name <n> Redis master group name, required with --sentinel
      --sentinel-password <pass>
                          Password for the sentinel nodes themselves
      --cluster <list>    Comma separated cluster host:port list, port [6379]
                          Prefix the nodes with rediss:// for TLS
      --redis-username <name>
                          Username for the Redis nodes behind the sentinels
                          or in the cluster
      --redis-password <pass>
                          Password for the Redis nodes behind the sentinels
      --redis-db <n>      Database to select behind the sentinels
      --tls               Connect to Redis over TLS
      --tls-ca <pem>      CA bundle to verify the server with (implies --tls)
      --tls-cert <pem>    Client certificate, with --tls-key (implies --tls)
      --tls-key <pem>     Client private key, with --tls-cert
      --tls-servername <name>
                          Hostname to verify the certificate against
      --tls-insecure      Skip certificate verification (implies --tls)
      --sentinel-tls      Use TLS for the sentinel nodes too
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
| `--sentinel` | `BULL_BOARD_SENTINELS` |
| `--sentinel-name` | `BULL_BOARD_SENTINEL_NAME` |
| `--sentinel-password` | `BULL_BOARD_SENTINEL_PASSWORD` |
| `--cluster` | `BULL_BOARD_CLUSTER_NODES` |
| `--redis-username` | `BULL_BOARD_REDIS_USERNAME` |
| `--redis-password` | `BULL_BOARD_REDIS_PASSWORD` |
| `--redis-db` | `BULL_BOARD_REDIS_DB` |
| `--tls` | `BULL_BOARD_REDIS_TLS` |
| `--tls-ca` | `BULL_BOARD_REDIS_TLS_CA` |
| `--tls-cert` | `BULL_BOARD_REDIS_TLS_CERT` |
| `--tls-key` | `BULL_BOARD_REDIS_TLS_KEY` |
| `--tls-servername` | `BULL_BOARD_REDIS_TLS_SERVERNAME` |
| `--tls-insecure` | `BULL_BOARD_REDIS_TLS_INSECURE` |
| `--sentinel-tls` | `BULL_BOARD_SENTINEL_TLS` |
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

`redis` takes a connection URL as above, or a full [ioredis options object](https://github.com/redis/ioredis#connect-to-redis) when a URL can't express the connection, which is what [Redis Sentinel](#redis-sentinel) needs.

`uiConfig` is the same object you'd pass to `createBullBoard({ options: { uiConfig } })` in code, see the [UIConfig reference](/configuration/ui-config) for the full set of fields. Board-wide title, logo, locale, and so on all live there, not at the top level of the config file.

`queues` is dual purpose: an array (`queues: ['emails', 'webhooks']`) is equivalent to `--queues`, a comma-free explicit list that skips discovery. An object, as above, instead sets per-queue [`QueueAdapterOptions`](/queue-adapters/bullmq) overrides keyed by queue name, the same options you'd pass to `new BullMQAdapter(queue, options)` directly. A queue's own `readOnlyMode: true` always wins even when the board as a whole isn't read-only, but it can't turn read-only mode back off for a single queue once `--read-only` is set globally. A field can't do both jobs in the same file: pick the array form to restrict which queues are served, or the object form to configure the ones discovery finds.

## Redis Sentinel

A Sentinel deployment has no fixed master address, so there is no single URL to point `--redis` at. `--sentinel` takes the sentinel nodes instead and lets ioredis work out which Redis is currently the master:

```sh
npx @bull-board/cli --sentinel s1.internal:26379,s2.internal:26379 --sentinel-name mymaster
```

Each entry is a `host` or `host:port`, with the port defaulting to 26379. An IPv6 literal is all colons, so it needs brackets to carry a port: `[2001:db8::1]:26379`. Without them the whole entry is read as a host and gets the default port. `--sentinel-name` is the master group name from your sentinel configuration, the same string you would pass as `name` to ioredis, and it is required: sentinels can monitor more than one group, so there is nothing sensible to guess.

`--sentinel` and `--redis` are mutually exclusive. Setting both is an error rather than a quiet precedence rule, so a leftover `BULL_BOARD_REDIS_URL` in a container's environment cannot silently send the dashboard to the wrong Redis.

The CLI holds one ioredis connection and hands it to everything else it builds, so failover handling is not a separate feature: the queue instances, Bull's second subscriber connection, and the `--history` recorder all follow the master through a failover because they share that connection. During the failover window the dashboard's own API requests fail the way they do for any dropped connection, and recover once ioredis has re-resolved the master.

### Credentials

A Redis URL carries its own credentials. Sentinel mode has no URL, so they get their own flags:

| Flag | Applies to |
|---|---|
| `--redis-username` | The Redis nodes behind the sentinels |
| `--redis-password` | The Redis nodes behind the sentinels |
| `--redis-db` | The Redis nodes behind the sentinels |
| `--sentinel-password` | The sentinel nodes themselves |

`--sentinel-password` is separate because sentinel nodes usually have a password of their own, distinct from the one guarding the data nodes.

These four are rejected alongside a Redis URL rather than merged into it. ioredis treats an explicitly passed option as a default and lets the URL win, so a `--redis-password` next to a URL that already carries one would be silently discarded. Refusing the combination outright is clearer than a flag that sometimes takes effect. With a URL, put the credentials in the URL.

### Everything else

The flags cover the common deployment. For anything past it, the config file's `redis` key also accepts a full [ioredis options object](https://github.com/redis/ioredis#connect-to-redis), passed through to the client untouched:

```js
// bull-board.config.js
module.exports = {
  redis: {
    sentinels: [
      { host: 's1.internal', port: 26379 },
      { host: 's2.internal', port: 26379 },
    ],
    name: 'mymaster',
    sentinelPassword: process.env.SENTINEL_PASSWORD,
    preferredSlaves: [{ ip: '10.0.0.12', port: '6379', prio: 1 }],
  },
};
```

That is the way to reach `preferredSlaves`, a custom `sentinelRetryStrategy`, or any other ioredis option without a flag. The object form is not limited to Sentinel: a plain `{ host, port }` works too, wherever a URL is awkward. With `--sentinel` or `--cluster` on the command line, the object still applies, underneath the addresses the flag gives: in cluster mode it becomes the options of every node. Credential and [TLS](#tls) flags apply on top of an object, so a password or a certificate can stay in the environment instead of the file.

## Redis Cluster

`--cluster` takes a comma-separated list of startup nodes and connects through them, the way `--redis` and `--sentinel` do for their topologies. ioredis discovers the rest of the cluster from any node that answers, so listing two or three is enough:

```sh
npx @bull-board/cli --cluster n1:7000,n2:7000,n3:7000 --prefix '{bull}'
```

`--redis-username` and `--redis-password` apply here as they do in sentinel mode. `--redis-db` does not: a cluster only has database 0, and passing it is an error rather than a silent no-op.

A cluster that only accepts TLS, such as AWS ElastiCache or MemoryDB with in-transit encryption, takes `rediss://` in front of its nodes. The [TLS section](#tls) covers that and every other TLS setting.

Options that belong to the cluster as a whole rather than to each node, such as `natMap` for a cluster that announces addresses you can't reach directly, go under a `cluster` key in the config file. `options` is passed to ioredis's `Cluster` as it is, and `nodes` lets the whole setup live in the file, with `--cluster` replacing those nodes when given:

```js
// bull-board.config.js
module.exports = {
  cluster: {
    nodes: ['rediss://10.0.0.1:6379'],
    options: {
      natMap: {
        '10.0.0.1:6379': { host: 'redis-1.example.com', port: 6379 },
        '10.0.0.2:6379': { host: 'redis-2.example.com', port: 6379 },
      },
    },
  },
};
```

A `cluster` key cannot be combined with `--redis`, `--sentinel` or a `redis` URL string in the same file, since each of those names a different topology. Per-node options still come from the `redis` object, so `cluster.options.redisOptions` is rejected rather than ignored.

Your queues need the hash-tagged prefix BullMQ already asks for in cluster mode, so one queue's keys stay in one slot:

```ts
new Queue('mailer', { connection, prefix: '{bull}' });
```

Point `--prefix` at the same string, braces included. Discovery scans every master rather than one, since `SCAN` carries no key for the client to route by.

Only BullMQ queues are served. Bull 3 builds its keys without a hash tag and its Lua touches several at once, so on a cluster every command it issues is a `CROSSSLOT` away from failing; such a queue is skipped with a warning naming it, rather than shown on the board with every action broken. BullMQ queues on the same cluster are unaffected.

The Redis stats panel reports the cluster as a whole, summing memory and client counts across the masters. [`--history`](#historical-metrics) works, storing everything under a single hash slot so its rollup script stays legal. The [historical metrics recipe](/recipes/historical-metrics#redis-cluster) covers what that means for the key layout.

## TLS

TLS is configured the same way whichever topology you connect to: a URL, sentinels or a cluster. One of these turns it on:

- a `rediss://` URL, as with any Redis client,
- `rediss://` in front of the `--cluster` nodes,
- `--tls`, or any of the other `--tls-*` flags below, which imply it.

With TLS on and nothing else set, the server certificate is checked against Node's built-in list of public CAs, which is all a managed service such as ElastiCache, MemoryDB, Upstash, Azure Cache or Redis Cloud needs:

```sh
npx @bull-board/cli --redis rediss://default:secret@redis.example.com:6380
npx @bull-board/cli --cluster rediss://clustercfg.my-cluster.abcdef.usw2.cache.amazonaws.com:6379
```

The other flags cover the rest:

| Flag | Environment variable | What it does |
|---|---|---|
| `--tls` | `BULL_BOARD_REDIS_TLS` | Turns TLS on without changing anything else. |
| `--tls-ca <pem>` | `BULL_BOARD_REDIS_TLS_CA` | Verifies the server against this CA bundle instead of the public CAs. Needed for a self-hosted Redis with a private CA. |
| `--tls-cert <pem>` | `BULL_BOARD_REDIS_TLS_CERT` | Client certificate, for a server that requires one (`tls-auth-clients yes`). Needs `--tls-key`. |
| `--tls-key <pem>` | `BULL_BOARD_REDIS_TLS_KEY` | Private key of the client certificate. Needs `--tls-cert`. |
| `--tls-servername <name>` | `BULL_BOARD_REDIS_TLS_SERVERNAME` | The hostname the certificate is checked against. Needed when you connect by IP address or through a tunnel while the certificate names a host. |
| `--tls-insecure` | `BULL_BOARD_REDIS_TLS_INSECURE` | Skips certificate verification. The connection is still encrypted, but anyone who can intercept it can pretend to be Redis, so the CLI prints a warning at startup. Meant for a development Redis with a self-signed certificate. |
| `--sentinel-tls` | `BULL_BOARD_SENTINEL_TLS` | Encrypts the connections to the sentinel nodes as well. |

Every `<pem>` value is either the path to a PEM file or the PEM text itself. A value starting with `-----BEGIN` is read as the text, which is how a certificate injected as an environment variable by Kubernetes, ECS or a secrets manager can be used without writing it to disk. An env file cannot hold a value spanning several lines, so the text may also be written on one line with `\n` in place of each line break.

### How each topology uses it

With a URL, the scheme decides: TLS needs `rediss://`. The `--tls-*` flags add a CA, a client certificate or a servername to that connection. Passing them with a `redis://` URL or a unix socket path is an error, because the URL asks for a plain connection.

With sentinels, the `--tls-*` flags apply to the master and replicas the sentinels point at. `--sentinel-tls` encrypts the connections to the sentinels as well, using the same CA and client certificate but not `--tls-servername`, since the sentinels have hostnames of their own. In ioredis terms this sets `tls` together with `enableTLSForSentinelMode`, plus `sentinelTLS`. Without `enableTLSForSentinelMode`, ioredis ignores `tls` for a master found through sentinels, without saying so.

In a cluster, the settings apply to every node, the startup nodes and the ones discovered from them. TLS is on or off for the whole cluster, so a list mixing `redis://` and `rediss://` is an error. Entries without a scheme follow the rest of the list, or the `--tls-*` flags.

In TLS cluster mode bull-board connects to each startup node by its hostname. ioredis's default is to resolve a startup node to an IP address first and connect to that, and a certificate that names a host, as ElastiCache's do, then fails verification with `ERR_TLS_CERT_ALTNAME_INVALID`. For a cluster, ioredis reports any failure on the startup nodes, this one included, as `Failed to refresh slots cache.`, which is easy to mistake for a network problem.

### Combining flags with the config file

The `redis` object in the config file can carry a `tls` block, and `sentinelTLS` for the sentinels. Flags are merged into those blocks one field at a time, so a CA set in the file and a `--tls-servername` given on the command line both take effect. A JavaScript config file can pass anything Node's [`tls.connect()`](https://nodejs.org/api/tls.html#tlsconnectoptions-callback) accepts, such as a key passphrase or a minimum TLS version:

```js
// bull-board.config.js
const { readFileSync } = require('node:fs');

module.exports = {
  redis: {
    tls: {
      ca: readFileSync('/etc/redis/ca.pem'),
      minVersion: 'TLSv1.3',
    },
  },
};
```

Two setups have no flag form and need the config file: sentinels and masters that use different CAs, and TLS sentinels in front of masters that don't use TLS. In both cases set `sentinelTLS` and `tls` in the `redis` object yourself. A `tls` block there turns TLS on for the master just as a flag does, and bull-board adds `enableTLSForSentinelMode` for it.

Settings that disagree about whether TLS is on stop the CLI with an error that names each side, instead of one of them winning without a word. That covers `redis://` cluster nodes next to a `tls` block in the config file, `tls: false` in the file next to `--tls` or `rediss://`, `enableTLSForSentinelMode: false` next to a `tls` block, and `BULL_BOARD_REDIS_TLS=false` or `BULL_BOARD_SENTINEL_TLS=false` next to anything that turns the same TLS on. The TLS environment switches accept `true`, `false`, `1`, `0`, `yes`, `no`, `on` and `off`, and any other value is an error.

### When the connection fails

| Error | Likely cause |
|---|---|
| `Connection is closed.`, or `Failed to refresh slots cache.` for a cluster, with no TLS setting | The server only accepts TLS. Use `rediss://` or `--tls`. |
| `self-signed certificate in certificate chain` | The server's certificate comes from a private CA. Pass that CA with `--tls-ca`. |
| `Hostname/IP does not match certificate's altnames` | The certificate names a different host from the one you connected to, typically because you connected by IP. Pass the name it carries with `--tls-servername`. |
| `alert certificate required` | The server requires a client certificate. Pass `--tls-cert` and `--tls-key`. |

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

`--history-retention-days` sets how long history is kept, 90 days by default. It moves the hourly and daily windows only and leaves minute-level detail at 7 days, since that tier holds essentially all the bytes. Per-tier retention, the key namespace, the snapshot interval and turning latency sampling off go in the config file under a `history` key:

```js
// bull-board.config.js
module.exports = {
  redis: 'redis://localhost:6379',
  history: {
    enabled: true,
    prefix: 'bull-board:metrics',
    retention: { minutes: 7, hours: 90, days: 90 },
    latency: false,
    snapshotIntervalMs: 60000,
  },
};
```

### What it writes

Recording writes to the same Redis your queues live in, under the `bull-board:metrics:` namespace, and never touches a key Bull or BullMQ owns. Set `history.prefix` in the config file to move that namespace, which is what keeps two boards on one Redis from sharing a history. Redis TTLs enforce retention, so there's nothing to prune by hand. [Storage footprint](/recipes/historical-metrics#storage-footprint) has the measured numbers; the short version is roughly 1.1 MB per queue for the counters at the default retention plus about 250 KB for latency, and an idle queue costs nothing.

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

Bull 3 queues aren't servable on a Redis Cluster, since Bull builds its keys without a hash tag. They're skipped with a warning; BullMQ queues on the same cluster work normally.

`--prefix` also doesn't take wildcards. A queue's Redis key and its name can both contain colons, so there's no reliable way to guess where a wildcard prefix ends and the queue name begins. List the prefixes you need explicitly instead, for example `--prefix bull,tenant-a,tenant-b`.
