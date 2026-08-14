# Standalone CLI

Sometimes you don't want to wire bull-board into an app at all, you just want to look at a Redis instance. `@bull-board/cli` does that: point it at a Redis URL and it finds the Bull and BullMQ queues stored there, then serves the same dashboard UI you'd get from any server adapter.

```sh
npx @bull-board/cli -r redis://localhost:6379
```

That starts the dashboard on `http://127.0.0.1:3000` and opens it in a browser. This is a tool for local development, evaluating bull-board before wiring it into your app, or looking at a queue on infrastructure you've tunnelled to. It is not a replacement for mounting the adapter in your own server: there's no auto-login, no framework-level auth to inherit, and every option has to be passed on the command line, an env var, or a config file instead of code.

## Discovery

On startup the CLI scans Redis for keys matching `<prefix>:<queue-name>:meta` (BullMQ) and `<prefix>:<queue-name>:id` (Bull) under each configured prefix, and builds a real `Queue` instance for every queue it finds. The default prefix is `bull`, which is what Bull and BullMQ both use unless you've changed it yourself. If your queues use a different prefix, pass `--prefix`.

By default it rescans every 10 seconds, so a queue created after the dashboard started still shows up without a restart. Pass `--scan-interval 0` to scan once at startup and stop.

If you'd rather skip discovery entirely, `--queues` takes an explicit, comma separated list of queue names to serve. The CLI still has to work out whether each one is Bull or BullMQ, but it no longer scans Redis for anything else under the prefix.

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
      --config <file>     Path to a config file
      --no-open           Do not open a browser
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
| `--no-open` | `BULL_BOARD_OPEN` (set to `false` to skip the browser; `--no-open` always wins) |
| `--config` | `BULL_BOARD_CONFIG` |

Settings resolve in this order: a command line flag wins, then the matching environment variable, then the config file, then the built-in default. That applies field by field, so you can set a Redis URL in the environment and still override just the port with a flag on one particular run.

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

## Docker Compose

Running the CLI as its own container next to your Redis works the same way:

```yaml
services:
  redis:
    image: redis:latest
    ports:
      - '6379:6379'

  bull-board:
    image: node:20-alpine
    command: npx -y @bull-board/cli --redis redis://redis:6379 --host 0.0.0.0 --no-open
    ports:
      - '3000:3000'
    depends_on:
      - redis
```

`--host 0.0.0.0` is required: the default `127.0.0.1` only accepts connections from inside the container. `--no-open` skips the browser launch, since there isn't one to open.

## What it doesn't do yet

Discovery only reads Redis. BullMQ v6 queues backed by PostgreSQL aren't found or servable through the CLI; use a server adapter in your own app for those, see the [PostgreSQL backend recipe](/recipes/postgres-backend).

`--prefix` also doesn't take wildcards. A queue's Redis key and its name can both contain colons, so there's no reliable way to guess where a wildcard prefix ends and the queue name begins. List the prefixes you need explicitly instead, for example `--prefix bull,tenant-a,tenant-b`.
