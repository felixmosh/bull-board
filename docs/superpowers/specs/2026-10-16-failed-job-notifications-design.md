# Failed-job notifications for bull-board

Date: 2026-10-16
Status: Approved by the user. Failure policy confirmed: notify only after retries are exhausted.
Upstream: https://github.com/felixmosh/bull-board at 34211726.

## Goal and scope

Extend the existing standalone `@bull-board/cli` dashboard with Discord and Telegram notifications configured entirely through environment variables. Preserve the upstream dashboard and its queue discovery, connection, authentication and shutdown behavior. Use the cloned source in `bull-board/`; do not restore or alter deleted files in the parent repository.

## Approaches

1. Recommended: integrate with the existing CLI queue lifecycle. Users run one dashboard process and supply env settings, without changing workers.
2. Add a public notification API to the framework libraries. This would support embedded apps but requires application code and a broader public API contract.
3. Run a separate notification daemon. This isolates delivery but adds another service and duplicates queue discovery and connection configuration.

Choose approach 1. This feature applies to the standalone CLI; embedding `createBullBoard` alone does not start notifications.

## Events and lifecycle

Monitor queues already selected/discovered by the CLI, including its configured Redis prefixes. For BullMQ, subscribe to terminal `failed` stream events using QueueEvents. Intermediate retry attempts do not trigger notifications. For legacy Bull queues, use the global failed event and verify terminal failure semantics against the installed Bull version before enabling delivery; tests must cover retries and automatically removed jobs.

Begin observing new events when a queue is registered. Do not alert on jobs already failed before startup. Follow new queues on rescans. Remove subscriptions when queues disappear; close all listeners, owned Redis clients, timers and in-flight requests on shutdown. Redis reconnection uses the existing connection configuration, including Sentinel/Cluster where supported by the queue library.

Notification errors are isolated from dashboard requests and worker execution. Notifications must work even when no browser is open. Only run one notification-enabled instance for a set of queues/destinations; multiple instances may send duplicates.

## Environment contract

Existing `BULL_BOARD_*` variables continue to configure Redis URL/Sentinel, prefixes, selected queues, host, port, basic authentication and browser behavior.

New variables:

| Variable | Default / behavior |
| --- | --- |
| `BULL_BOARD_NOTIFICATIONS_ENABLED` | `false`; master switch |
| `BULL_BOARD_DISCORD_ENABLED` | `false` |
| `BULL_BOARD_DISCORD_WEBHOOK_URL` | Required when Discord is enabled |
| `BULL_BOARD_DISCORD_THREAD_ID` | Optional Discord thread |
| `BULL_BOARD_TELEGRAM_ENABLED` | `false` |
| `BULL_BOARD_TELEGRAM_BOT_TOKEN` | Required when Telegram is enabled |
| `BULL_BOARD_TELEGRAM_CHAT_ID` | Required when Telegram is enabled; negative group IDs supported |
| `BULL_BOARD_TELEGRAM_MESSAGE_THREAD_ID` | Optional positive Telegram topic ID |
| `BULL_BOARD_NOTIFICATION_APP_NAME` | `bull-board`; label included in messages |
| `BULL_BOARD_NOTIFICATION_TIMEOUT_MS` | `10000`; per-request timeout |
| `BULL_BOARD_NOTIFICATION_MAX_ATTEMPTS` | `3`; delivery attempts, including first send |
| `BULL_BOARD_NOTIFICATION_RETRY_DELAY_MS` | `1000`; initial retry backoff |
| `BULL_BOARD_NOTIFICATION_MAX_PENDING` | `200`; shared bound for queued and active deliveries |

Validate booleans, integer ranges, target formats and required enabled-channel credentials before connecting to Redis. If the master switch is enabled, require at least one enabled channel. No notification settings UI, database or config file is required. Changing env requires restarting the process.

Include a documented `.env.example` and a Node `--env-file=.env` startup command. Existing process environment and Docker Compose `env_file` work as well. Ignore actual `.env` files in Git. Examples contain placeholders only.

## Message and delivery

Send one bounded plain-text message per terminal failure to each enabled channel. Include app label, queue/prefix, job ID, timestamp and failed reason; add job name only when available without relying on retained job data. Events still produce a useful alert when `removeOnFail` deleted the job. Exclude job payloads and results. Truncate messages to provider limits without splitting Unicode surrogate pairs.

Discord disables automatic mentions. Telegram sends plain text with no parse mode. Use HTTPS provider endpoints, request cancellation and bounded response handling. Sanitize provider errors so tokens, webhook URLs and raw response bodies do not appear in logs.

Use a shared bounded in-memory delivery queue with limited concurrency and independent channel processing. Retry network failures, timeouts, HTTP 429 and 5xx. Respect provider retry-after hints. Other 4xx responses are terminal. When full, drop new notifications and report a bounded warning. Shutdown stops admission and cancels active requests. Pending work is lost on restart; provider receipt loss can cause a duplicate on retry. This feature does not provide durable or exactly-once delivery.

## Validation and delivery artifacts

- Unit tests for env defaults, invalid configuration, disabled channels and secret-safe errors.
- Provider tests using local mocks: payloads, mentions, Unicode truncation, timeouts, 429 retry delay, transient/permanent errors, and channel independence.
- Lifecycle tests for queue add/remove, disabled notifications, bounded pending work and shutdown.
- Redis integration tests with real BullMQ/Bull workers: retry exhaustion, eventual success without an alert, immediate failure, and `removeOnFail`.
- Build and applicable existing CLI tests, lint and formatting checks.
- README instructions and `.env.example` with commands to build and run the cloned source.

Real Discord/Telegram delivery requires user-supplied credentials. Automated verification uses mocks and never sends to real destinations.
