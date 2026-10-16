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
      --sentinel <list>   Comma separated sentinel host:port list, port [26379]
      --sentinel-name <n> Redis master group name, required with --sentinel
      --sentinel-password <pass>
                          Password for the sentinel nodes themselves
      --redis-username <name>
                          Username for the Redis nodes behind the sentinels
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
```

Every flag also has an environment variable equivalent (`BULL_BOARD_REDIS_URL`, `BULL_BOARD_PORT`, `BULL_BOARD_READ_ONLY`, and so on), and a `bull-board.config.{mjs,js,cjs,json}` file for anything that doesn't fit on a command line. Flags win over environment variables, which win over the config file, which wins over the built-in default.

If Redis is unreachable when the CLI starts, it still opens: it serves a diagnostic page explaining why (the URL it dialled, the underlying error, and the likely causes), keeps retrying every 3 seconds, and switches to the real dashboard on its own the moment Redis answers, no restart needed. That only covers startup, though: once the dashboard is live it stays live, even if Redis later goes away. The diagnostic page does not come back; API requests just stop returning until Redis is reachable again, and Ctrl-C still works. Pass `--no-retry` for the old behaviour instead: print the error and exit 1 immediately, without ever opening a port, which is what a script or CI checking the exit code wants.

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

## Redis Sentinel

`--sentinel` connects through Redis Sentinel rather than to one instance directly, for a deployment where the master address is not fixed:

```sh
npx @bull-board/cli --sentinel s1.internal:26379,s2.internal:26379 --sentinel-name mymaster
```

A port is optional per entry and defaults to 26379. `--sentinel-name` is the master group name from your sentinel configuration and is required. `--sentinel` and `--redis` are mutually exclusive, and passing both is an error rather than a silent preference for one.

ioredis resolves the current master through the sentinels listed and follows a failover on its own, so the whole dashboard moves with it: queue reads, the Bull subscriber, and `--history` recording all share the one connection.

Credentials in sentinel mode come from their own flags, since there is no URL to carry them. `--redis-username`, `--redis-password` and `--redis-db` apply to the Redis nodes behind the sentinels, while `--sentinel-password` authenticates to the sentinel nodes themselves, which commonly have a different password. Passing any of them alongside a Redis URL is an error, because ioredis would take the URL's own credentials and ignore them.

For anything beyond that, including TLS to the sentinel nodes, the config file's `redis` key accepts a full [ioredis options object](https://github.com/redis/ioredis#connect-to-redis) and is passed through untouched:

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
    enableTLSForSentinelMode: true,
  },
};
```

## Historical metrics

`--history` turns on the long-retention metrics that otherwise need `@bull-board/metrics` wired into an app of your own:

```sh
npx @bull-board/cli -r redis://localhost:6379 --history
```

Every queue chart gains a 60m / 7d / 30d / 90d range selector, and a cross-queue Metrics history page shows up in the sidebar. The CLI process does the recording itself, copying throughput, wait time, run time and queue age into Redis once a minute under the `bull-board:metrics:` namespace, never over a key Bull or BullMQ owns. Recording follows discovery, so a queue that appears between rescans is picked up on the next tick.

`--history-retention-days` sets the window, 90 days by default. Per-tier retention, the snapshot interval and `latency: false` go in the config file under a `history` key. `--read-only` keeps the reading and stops the writing, for a board that only displays what another process records.

Completed and failed history comes out of BullMQ's own metrics buffer, so it stays empty unless your workers were built with `metrics: { maxDataPoints: MetricsTime.ONE_WEEK }`; the CLI warns at startup when no discovered queue has any. Latency and queue age need nothing from your workers. See the [historical metrics recipe](https://felixmosh.github.io/bull-board/recipes/historical-metrics) for storage sizing and what the charts show.

## Docker

```sh
docker run --rm -p 127.0.0.1:3000:3000 \
  -e BULL_BOARD_USER=admin -e BULL_BOARD_PASSWORD=secret \
  ghcr.io/felixmosh/bull-board --redis redis://host.docker.internal:6379
```

`ghcr.io/felixmosh/bull-board` is this package as an image, built for amd64 and arm64 on every release and tagged with the exact version, the major, and `latest`. The entrypoint is the CLI, so flags and `BULL_BOARD_*` variables work exactly as they do above. The only things the image decides for you are `BULL_BOARD_HOST=0.0.0.0` and `BULL_BOARD_OPEN=false`, the two defaults that make no sense in a container, and you can override both. [Run with Docker](https://felixmosh.github.io/bull-board/guide/docker) covers Compose, tags and mounting a config file.

Discovery only reads Redis, so BullMQ v6 queues backed by PostgreSQL aren't found here; use a server adapter in your own app for those. `--prefix` doesn't take wildcards either, list the prefixes you need explicitly.

See the [CLI guide](https://felixmosh.github.io/bull-board/guide/cli) for the full flag and environment variable reference and the basic auth walkthrough.

## Failed-job notifications (this fork)

The standalone CLI can notify Discord, Telegram, or both whenever a monitored BullMQ or Bull job **finally fails**. Automatic retries that later succeed do not send alerts. Early terminal failures, such as discarded jobs, also notify. Workers need no changes, and the dashboard need not be open in a browser. This feature is enabled by the CLI; mounting the framework packages alone does not start it.

### Run from this source checkout

Use Node.js 22 or newer and Corepack. From the repository root:

```sh
corepack yarn install --immutable
corepack yarn build
cp .env.example .env
# Edit .env with your Redis connection and notification destinations.
node --env-file=.env packages/cli/dist/bin.js
```

The root `.env.example` includes dashboard, Redis and notification settings. Node's `--env-file` loads the file before the CLI starts; exported environment variables take precedence. The CLI itself does not automatically read `.env`. Restart after changing settings. Docker can supply the same variables with `--env-file`, but the upstream Dockerfile/image installs the published CLI and does not include this fork's changes; use the built source for this feature.

For Discord, create an incoming webhook in the destination channel, set `BULL_BOARD_DISCORD_ENABLED=true`, and copy its full URL to `BULL_BOARD_DISCORD_WEBHOOK_URL`. For Telegram, create a bot with BotFather, add it to the target chat/channel with permission to send messages, then set `BULL_BOARD_TELEGRAM_ENABLED=true`, `BULL_BOARD_TELEGRAM_BOT_TOKEN` and `BULL_BOARD_TELEGRAM_CHAT_ID`. Group chat IDs are usually negative. A bot must have received `/start` before it can message an individual user.

Finally, set `BULL_BOARD_NOTIFICATIONS_ENABLED=true`. Enabling only one channel is supported. Missing or invalid settings fail startup with the variable name, without echoing credentials.

Open **Settings → Notifications** to inspect the active configuration. This section is read-only: webhook URLs and bot tokens are never sent to the browser and appear only as configured/not configured. Update environment variables and restart the server to change notification settings. When the master switch is off, the section reports that no delivery configuration is active.

| Environment variable | Default | Meaning |
| --- | --- | --- |
| `BULL_BOARD_NOTIFICATIONS_ENABLED` | `false` | Master switch; requires at least one enabled channel |
| `BULL_BOARD_DISCORD_ENABLED` | `false` | Enable Discord webhook deliveries |
| `BULL_BOARD_DISCORD_WEBHOOK_URL` | — | Required Discord HTTPS incoming webhook URL |
| `BULL_BOARD_DISCORD_THREAD_ID` | — | Optional Discord thread ID |
| `BULL_BOARD_TELEGRAM_ENABLED` | `false` | Enable Telegram deliveries |
| `BULL_BOARD_TELEGRAM_BOT_TOKEN` | — | Required Telegram bot token |
| `BULL_BOARD_TELEGRAM_CHAT_ID` | — | Required numeric chat ID or `@channel_username` |
| `BULL_BOARD_TELEGRAM_MESSAGE_THREAD_ID` | — | Optional positive integer topic ID |
| `BULL_BOARD_NOTIFICATION_BOARD_URL` | unset | Public dashboard root including any base path; enables job and failed-queue links |
| `BULL_BOARD_NOTIFICATION_APP_NAME` | `bull-board` | Message label, at most 120 UTF-16 units |
| `BULL_BOARD_NOTIFICATION_TIMEOUT_MS` | `10000` | Request timeout, 100–60000 ms |
| `BULL_BOARD_NOTIFICATION_MAX_ATTEMPTS` | `3` | Total delivery attempts, 1–10 |
| `BULL_BOARD_NOTIFICATION_RETRY_DELAY_MS` | `1000` | Initial retry backoff, 10–60000 ms |
| `BULL_BOARD_NOTIFICATION_MAX_PENDING` | `200` | Maximum queued + active deliveries, 1–10000 |

Notification booleans accept `true`, `false`, `1` and `0`. Queue selection uses existing `BULL_BOARD_PREFIX` and `BULL_BOARD_QUEUES` settings; leaving queues empty discovers queues automatically and follows rescans. The feature works in dashboard read-only mode. Each monitored BullMQ queue needs a dedicated Redis stream connection; Bull queues share a subscriber. Redis ACLs must allow the queue library's event reads/subscriptions and connection setup as well as normal dashboard reads.

Messages contain the app label, queue/prefix, job ID, failure time and truncated failed reason. They omit job payloads and results and still work when `removeOnFail` removes the job. Error text is sent to your chosen destinations, so avoid putting secrets in thrown error messages. Messages are capped at 1900 UTF-16 units, Discord automatic mentions are disabled, and Telegram uses plain text.

Delivery uses at most one active request per channel. Network errors, timeouts, HTTP 429 and 5xx responses retry with exponential backoff capped at 60 seconds; a provider's longer `Retry-After` is respected across that channel. Other provider errors stop the delivery. Responses are capped at 32 KiB. New deliveries are dropped when capacity is full, with a rate-limited warning. Pending deliveries expire after 30 minutes. These internal safety limits do not require extra configuration.

Discord alerts use a red embed with a failure summary, metadata fields and a clickable title. Telegram alerts use escaped HTML with inline navigation buttons. Set `BULL_BOARD_NOTIFICATION_BOARD_URL=https://queues.example.com/board` to your public dashboard URL, including its complete base path; do not include credentials, query parameters or a fragment. Leave it empty to omit links. Localhost links open on the recipient's device, so use a reachable host for remote recipients. Existing dashboard authentication still applies.

Alerts include queue, Redis prefix, queue engine, job ID, failure time and error reason. Retained jobs additionally provide job name, attempts made/configured and processing time for the final attempt. Detail lookups are best-effort, limited to four concurrent reads, and fall back to event metadata after 500 ms or immediately under load. Auto-removed jobs still alert; the failed-queue link is useful when the job detail no longer exists. Job data, full options and stack traces are not included. Long text is truncated to provider limits; oversized job URLs fall back to the queue/dashboard rather than pointing to a truncated identifier. The public URL also appears in read-only Settings → Notifications.

Pending work is in RAM and lost on restart. The listener starts with new events, so starting the dashboard does not replay existing failed jobs. Bull uses live Pub/Sub and cannot replay events lost during a disconnect; BullMQ stream recovery is limited by Redis stream retention. Run one notification-enabled dashboard per queue/destination set: multiple instances, manual retries of failed jobs, or retrying a request whose receipt was lost can produce duplicate messages. This is best-effort delivery, without durable or exactly-once guarantees.

### Hướng dẫn nhanh

Sao chép `.env.example` thành `.env`, điền Redis, bật `BULL_BOARD_NOTIFICATIONS_ENABLED=true` và bật ít nhất một kênh Discord/Telegram cùng thông tin tương ứng. Chạy lệnh Node ở trên sau khi build. App sẽ tự theo dõi queue; chỉ gửi tin khi job thất bại cuối cùng, kể cả job đã tự xóa bằng `removeOnFail`. Muốn đổi cấu hình, sửa `.env` rồi khởi động lại app. Không commit file `.env` chứa token/webhook.
