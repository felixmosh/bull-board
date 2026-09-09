export const HELP = `
bull-board - run the bull-board dashboard against a Redis instance

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
      --redis-username <name>
                          Username for the Redis nodes behind the sentinels
                          or in the cluster
      --redis-password <pass>
                          Password for the Redis nodes behind the sentinels
      --redis-db <n>      Database to select behind the sentinels
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

If Redis is unreachable at startup, bull-board still opens: it serves a
diagnostic page explaining why, keeps retrying every 3 seconds, and switches
to the real dashboard on its own once Redis answers. That only covers
startup: once the dashboard is live it stays live, even if Redis goes away
later. The diagnostic page does not come back; API requests just stop
returning until Redis is reachable again, and Ctrl-C still works.
Pass --no-retry to get the old behaviour back instead: print the error and
exit 1 immediately, without opening a port.

--history turns on historical metrics: the dashboard gains a range selector
per queue and a cross-queue Metrics history page, and this process records
throughput, latency and queue age into Redis under the bull-board:metrics:
namespace once a minute. --read-only stops the recording but keeps serving
whatever another process has recorded.

--cluster connects to a Redis Cluster, taking a comma-separated list of
startup nodes. Only BullMQ queues are served: Bull 3 builds keys without a
hash tag, so on a cluster its commands fail, and such queues are skipped with
a warning rather than shown broken. --history works, storing everything under
one hash slot so its rollup script stays legal.

--sentinel connects through Redis Sentinel instead of a URL, and the two are
mutually exclusive. ioredis resolves the current master through the sentinels
listed and follows a failover on its own, so queue reads, the Bull subscriber
and --history recording all move with it. The credential flags above apply to
sentinel and cluster mode only; with a Redis URL, put credentials in the URL
itself.

Environment variables mirror every flag, for example BULL_BOARD_REDIS_URL,
BULL_BOARD_SENTINELS, BULL_BOARD_SENTINEL_NAME, BULL_BOARD_CLUSTER_NODES,
BULL_BOARD_PORT, BULL_BOARD_READ_ONLY.

Examples:
  bull-board
  bull-board -r redis://localhost:6379 -p 4000
  bull-board --prefix tenant-a,tenant-b --read-only
  bull-board --user admin --password secret --host 0.0.0.0
  bull-board --sentinel s1:26379,s2:26379 --sentinel-name mymaster
  bull-board --cluster n1:7000,n2:7000,n3:7000
`;
