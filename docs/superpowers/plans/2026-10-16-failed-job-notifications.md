# Failed-job notifications implementation plan

> **For agentic workers:** Execute inline with superpowers:executing-plans. Use test-first changes and review before completion.

**Goal:** Add env-only Discord/Telegram terminal-failure alerts to the upstream CLI.

**Architecture:** Resolve env into a nullable notification config. The queue factory owns terminal-failure subscriptions. A shared delivery service formats bounded text and dispatches through provider adapters with bounded retries and shutdown cancellation.

**Tech Stack:** TypeScript, Jest, Node fetch/AbortController, BullMQ QueueEvents, Bull global events, Redis integration tests.

## Task 1: Environment configuration

Files: `packages/cli/src/notifications/config.ts`, `packages/cli/src/config/{types,resolve}.ts`, `packages/cli/tests/notification-config.spec.ts`.

- [x] Write and run failing tests for disabled defaults, required channels/credentials, strict booleans, integer limits, HTTPS webhook validation and secret-safe errors.
- [x] Implement `resolveNotifications(env): NotificationConfig | null`, call it in `resolveConfig`, and retain compatibility for programmatic configs.
- [x] Run `yarn workspace @bull-board/cli test notification-config --runInBand`.

## Task 2: Provider transport and delivery queue

Files: `packages/cli/src/notifications/{format,providers,service}.ts`, `packages/cli/tests/notifications.spec.ts`.

- [x] Write failing tests using HTTP/fetch fixtures for Discord/Telegram bodies, Unicode caps, timeout, retry classifications, Retry-After, bounded pending work, channel independence and close cancellation.
- [x] Implement plain-text formatting; POST HTTPS with redirects rejected, response body bounded, errors reduced to stable codes, and Discord mentions disabled.
- [x] Implement one periodic scheduler, at most one active send per channel, shared queued/active count cap, attempts limit and bounded enqueue lifetime; use AbortController per send.
- [x] Run `yarn workspace @bull-board/cli test notifications --runInBand`.

## Task 3: Terminal events and application lifecycle

Files: `packages/cli/src/{queueFactory,index}.ts`, `packages/cli/src/notifications/subscribe.ts`, `packages/cli/tests/notification-events.spec.ts`.

- [x] Inspect installed Bull/BullMQ event scripts to verify retries and removeOnFail semantics.
- [x] Write and run failing lifecycle and Redis tests proving only exhausted failures alert, successful retries do not alert, auto-removal still alerts, queue removal/shutdown detach listeners and no startup replay occurs.
- [x] Attach subscriptions in queue creation and close them with handles; connect the delivery service to both application shutdown branches.
- [x] Run `yarn workspace @bull-board/cli test --runInBand` with an isolated Redis process.

## Task 4: Documentation, build and review

Files: `.env.example`, `.gitignore`, `packages/cli/README.md`, `README.md`.

- [x] Document every env variable, defaults/ranges, retry exhaustion, startup commands, restart behavior and single-instance delivery limits. Add Vietnamese quick-start instructions.
- [x] Run `yarn build`, CLI tests, lint, formatting and `git diff --check`.
- [x] Request code review, fix material findings and rerun affected checks.
- [x] Report verified results and exact commands to run the cloned source; do not claim live provider delivery without credentials.

## Verification — 2026-10-16

- `node .yarn/releases/yarn-4.17.0.cjs build`: passed for all build workspaces.
- `REDIS_PORT=16389 node .yarn/releases/yarn-4.17.0.cjs workspace @bull-board/cli test --runInBand`: 14 suites passed, 182 tests passed, 3 existing Redis Cluster tests skipped because no cluster was configured.
- Changed TypeScript files: oxlint and oxfmt checks passed; `git diff --check` passed. Repository-wide lint also passed with four pre-existing no-new-array warnings outside the changes.
- Built CLI launched with Node `--env-file=.env.example` against isolated Redis: dashboard HTTP 200, SIGTERM exit 0.
- Review findings fixed and re-reviewed: retry interrupted provider bodies; close an unready owned BullMQ connection without leaking reconnect loops. Regression tests passed. Malformed retry hints are also ignored safely.
- Actual `.env` created from the example and verified ignored by Git. It contains blank provider credentials and disabled notification switches for the user to fill in.
- Tests used a disposable Redis container and HTTP mocks; no real Discord/Telegram messages were sent. Keep implementation on local branch `codex/failure-notifications`.
