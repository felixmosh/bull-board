# @bull-board/cli

Run the [bull-board](https://github.com/felixmosh/bull-board) dashboard against a Redis instance, no app to wire it into.

```sh
npx @bull-board/cli -r redis://localhost:6379
```

That opens `http://127.0.0.1:3000` with the dashboard for every Bull and BullMQ queue it finds under the `bull` key prefix.

![bull-board dashboard](https://raw.githubusercontent.com/felixmosh/bull-board/master/website/docs/public/screenshots/dashboard-overview.png)

## When you'd reach for this

- The workers live in a repo or a container you are not editing, and you want to watch jobs move without adding a route to an app you would then have to remember to remove.
- Your producers are not Node. BullMQ has an official Python package and gets written to over the raw protocol from other languages. Those teams have no app to embed the dashboard into.
- You want to look at a queue on staging or production through a tunnel, without deploying anything.
- You are evaluating bull-board and would rather see your own queues than wire up an integration first.

This is not a replacement for mounting an adapter in your own server: there's no auto-login, no framework-level auth to inherit, and every option has to be passed on the command line, an env var, or a config file instead of code.

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
  -h, --help              Show this help
  -v, --version           Show the version
```

Every flag also has an environment variable equivalent (`BULL_BOARD_REDIS_URL`, `BULL_BOARD_PORT`, `BULL_BOARD_READ_ONLY`, and so on), and a `bull-board.config.{mjs,js,cjs,json}` file for anything that doesn't fit on a command line. Flags win over environment variables, which win over the config file, which wins over the built-in default.

```js
// bull-board.config.js
module.exports = {
  redis: 'redis://localhost:6379',
  prefix: ['bull', 'tenant-a'],
  uiConfig: {
    boardTitle: 'Ops Dashboard',
  },
  queues: {
    'payment-webhooks': { readOnlyMode: true },
  },
};
```

Discovery only reads Redis, so BullMQ v6 queues backed by PostgreSQL aren't found here; use a server adapter in your own app for those. `--prefix` doesn't take wildcards either, list the prefixes you need explicitly.

See the [CLI guide](https://felixmosh.github.io/bull-board/guide/cli) for the full flag and environment variable reference, a Docker Compose example, and the basic auth walkthrough.
