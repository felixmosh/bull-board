# @bull-board/cli

Run the [bull-board](https://github.com/felixmosh/bull-board) dashboard against a Redis instance, no app to wire it into.

```sh
npx @bull-board/cli -r redis://localhost:6379
```

That opens `http://127.0.0.1:3000` with the dashboard for every Bull and BullMQ queue it finds under the `bull` key prefix. This is a tool for local development, evaluating bull-board, or looking at a queue on infrastructure you've tunnelled to, not a replacement for mounting an adapter in your own server.

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
