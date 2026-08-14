export const HELP = `
bull-board - run the bull-board dashboard against a Redis instance

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

Environment variables mirror every flag, for example BULL_BOARD_REDIS_URL,
BULL_BOARD_PORT, BULL_BOARD_READ_ONLY.

Examples:
  bull-board
  bull-board -r redis://localhost:6379 -p 4000
  bull-board --prefix tenant-a,tenant-b --read-only
  bull-board --user admin --password secret --host 0.0.0.0
`;
