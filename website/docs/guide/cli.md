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

## When Redis isn't reachable

The dashboard still opens even if Redis is down or the URL is wrong. Instead of a dead terminal, `npx @bull-board/cli` serves a diagnostic page at the same URL, explaining what it tried to connect to, the underlying error, and the likely cause: Redis isn't running, the port is wrong (6379 is the default), it's in a container whose port isn't published, it needs credentials, or it needs TLS and therefore a `rediss://` URL. A `--user`/`--password` you've set still guards this page: the URL it names is never served to a request without the right credentials.

The process stays alive and keeps retrying every 3 seconds. The page polls its own status and reloads on its own the moment Redis answers, switching to the real dashboard with no restart and no second command.

That healing only applies before the first successful connection. Once the dashboard is live, it stays live for the rest of the process, even if Redis goes away later: the diagnostic page does not come back, and the dashboard's own API requests simply stop returning until Redis is reachable again. Ctrl-C still works during that window; the CLI's shutdown is bounded so it never hangs waiting on a dead connection.

A second, rarer page shows up if the CLI reaches Redis but something after that fails for a reason that has nothing to do with connectivity -- an ACL-restricted user that can authenticate but not run `SCAN`, say. That page names the real error too, but does not promise a retry, since reconnecting again would not fix it; restart the CLI once the underlying problem is addressed.

For scripts and CI, retrying forever is the wrong default: they want a non-zero exit code, not a process that waits indefinitely. Pass `--no-retry` to get the old behaviour back: print the error and exit 1 immediately if the first connection attempt fails, without ever opening a port.

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
| `--no-open` | `BULL_BOARD_OPEN` (set to `false` to skip the browser; `--no-open` always wins) |
| `--no-retry` | `BULL_BOARD_NO_RETRY` |
| `--browser` | `BULL_BOARD_BROWSER`, then `BROWSER` |
| `--config` | `BULL_BOARD_CONFIG` |

Settings resolve in this order: a command line flag wins, then the matching environment variable, then the config file, then the built-in default. That applies field by field, so you can set a Redis URL in the environment and still override just the port with a flag on one particular run.

`--browser` picks the command used to open the dashboard: `$BROWSER` names it, `--browser` overrides it, and `BULL_BOARD_BROWSER` sits between the two if you'd rather not touch `$BROWSER` globally. Without any of them, the CLI falls back to the platform opener (`open` on macOS, `start` on Windows, `xdg-open` elsewhere). A `browser` set in the config file follows the same precedence as everything else in the config file: `--browser`, `BULL_BOARD_BROWSER`, and even a plain `$BROWSER` all win over it, since each of those is still "the matching environment variable" ahead of the config file in the resolution order above -- so an exported `$BROWSER` left over from another tool can silently override a `browser` you set in the config file. A command with arguments works too, for example `--browser 'open -a Safari'`: it's split on whitespace and the URL is appended as the last argument, and it never goes through a shell, on any platform, including Windows. Because the split is on whitespace, a single path containing spaces (the common macOS form, `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`, or CRA's `BROWSER="google chrome"`) doesn't work as a single argument; each word after the first is treated as an argument to a command that doesn't exist at that path, so it does not fall back to the platform opener -- it fails to spawn, same as naming any other command that isn't installed, and you'll see "Could not open a browser automatically" and can open the URL yourself. `--no-open` skips opening a browser at all, regardless of what `--browser` or `$BROWSER` say.

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

## Docker

`ghcr.io/felixmosh/bull-board` is the CLI as an image, built on every release for `linux/amd64` and `linux/arm64`, and tagged with the exact version (`9.5.0`), the major (`9`), and `latest`. The [package page](https://github.com/felixmosh/bull-board/pkgs/container/bull-board) lists every tag that exists.

```sh
docker run --rm -p 127.0.0.1:3000:3000 \
  -e BULL_BOARD_USER=admin -e BULL_BOARD_PASSWORD=secret \
  ghcr.io/felixmosh/bull-board --redis redis://host.docker.internal:6379
```

`host.docker.internal` is how a container reaches a Redis running on the host. Docker Desktop provides it; on plain Docker Engine, add `--add-host host.docker.internal:host-gateway` to the run command.

The entrypoint is the CLI itself, so anything after the image name is a flag exactly as documented above, and every `BULL_BOARD_*` variable behaves the same way it does outside a container. The image presets two of them, because the defaults that suit a laptop don't suit a container: `BULL_BOARD_HOST=0.0.0.0`, since the default `127.0.0.1` only accepts connections from inside the container, and `BULL_BOARD_OPEN=false`, since there is no browser in there to open. Both are ordinary environment variables, so `--host` or your own `-e BULL_BOARD_HOST` still wins.

Alongside a Redis of your own, in Compose:

```yaml
services:
  redis:
    image: redis:latest
    ports:
      - '6379:6379'

  bull-board:
    image: ghcr.io/felixmosh/bull-board:9
    command: --redis redis://redis:6379
    environment:
      BULL_BOARD_USER: ${BULL_BOARD_USER}
      BULL_BOARD_PASSWORD: ${BULL_BOARD_PASSWORD}
    ports:
      - '127.0.0.1:3000:3000'
    depends_on:
      - redis
```

Listening on every interface inside the container means `BULL_BOARD_USER`/`BULL_BOARD_PASSWORD` (or `--user`/`--password`) are not optional here, and the port mapping publishes to `127.0.0.1` on the host rather than every interface. The CLI warns at startup if it's bound to a non-loopback host with no auth configured, since that combination is an unauthenticated dashboard, complete with delete-job and obliterate-queue, reachable from anywhere that can route to the host.

Basic auth over plain HTTP still sends credentials in the clear. Binding to `0.0.0.0` and exposing the port beyond the host (a routable address, a cloud security group, a reverse proxy without TLS) needs an SSH tunnel or a TLS-terminating proxy in front regardless of whether auth is configured.

The image runs as the unprivileged `node` user in `/app`, which is where the CLI looks for a config file. Mount one there and it gets picked up without a `--config` flag, as long as it's readable by uid 1000:

```yaml
    volumes:
      - ./bull-board.config.js:/app/bull-board.config.js:ro
```

The image also ships a `HEALTHCHECK` that polls the dashboard on its own port, so `depends_on: { bull-board: { condition: service_healthy } }` works for anything you want to start behind it. Basic auth doesn't interfere with it: a 401 still proves the server is answering.

### Without the image

If you'd rather not pull an image, the same thing runs from npm inside a stock Node container. It re-resolves the package from the registry on every start, so it pins nothing and needs egress to npm:

```yaml
  bull-board:
    image: node:22-alpine
    command: npx -y @bull-board/cli --redis redis://redis:6379 --host 0.0.0.0 --no-open
    environment:
      BULL_BOARD_USER: ${BULL_BOARD_USER}
      BULL_BOARD_PASSWORD: ${BULL_BOARD_PASSWORD}
    ports:
      - '127.0.0.1:3000:3000'
    depends_on:
      - redis
```

`--host 0.0.0.0` and `--no-open` are explicit here, since only the bull-board image presets them.

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
