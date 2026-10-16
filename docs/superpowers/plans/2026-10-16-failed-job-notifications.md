# Failed-job notifications implementation plan

> **For agentic workers:** Execute inline with superpowers:executing-plans. Use test-first changes and review before completion.

**Goal:** Add env-only Discord/Telegram terminal-failure alerts to the upstream CLI.

**Architecture:** Resolve env into a nullable notification config. The queue factory owns terminal-failure subscriptions. A shared delivery service formats bounded text and dispatches through provider adapters with bounded retries and shutdown cancellation.

**Tech Stack:** TypeScript, Jest, Node fetch/AbortController, BullMQ QueueEvents, Bull global events, Redis integration tests.

## Task 1: Environment configuration

Files: `packages/cli/src/notifications/config.ts`, `packages/cli/src/config/{types,resolve}.ts`, `packages/cli/tests/notification-config.spec.ts`.

- [ ] Write and run failing tests for disabled defaults, required channels/credentials, strict booleans, integer limits, HTTPS webhook validation and secret-safe errors.
- [ ] Implement `resolveNotifications(env): NotificationConfig | null`, call it in `resolveConfig`, and retain compatibility for programmatic configs.
- [ ] Run `yarn workspace @bull-board/cli test notification-config --runInBand`.

## Task 2: Provider transport and delivery queue

Files: `packages/cli/src/notifications/{format,providers,service}.ts`, `packages/cli/tests/notifications.spec.ts`.

- [ ] Write failing tests using HTTP/fetch fixtures for Discord/Telegram bodies, Unicode caps, timeout, retry classifications, Retry-After, bounded pending work, channel independence and close cancellation.
- [ ] Implement plain-text formatting; POST HTTPS with redirects rejected, response body bounded, errors reduced to stable codes, and Discord mentions disabled.
- [ ] Implement one periodic scheduler, at most one active send per channel, shared queued/active count cap, attempts limit and bounded enqueue lifetime; use AbortController per send.
- [ ] Run `yarn workspace @bull-board/cli test notifications --runInBand`.

## Task 3: Terminal events and application lifecycle

Files: `packages/cli/src/{queueFactory,index}.ts`, `packages/cli/src/notifications/subscribe.ts`, `packages/cli/tests/notification-events.spec.ts`.

- [ ] Inspect installed Bull/BullMQ event scripts to verify retries and removeOnFail semantics.
- [ ] Write and run failing lifecycle and Redis tests proving only exhausted failures alert, successful retries do not alert, auto-removal still alerts, queue removal/shutdown detach listeners and no startup replay occurs.
- [ ] Attach subscriptions in queue creation and close them with handles; connect the delivery service to both application shutdown branches.
- [ ] Run `yarn workspace @bull-board/cli test --runInBand` with an isolated Redis process.

## Task 4: Documentation, build and review

Files: `.env.example`, `.gitignore`, `packages/cli/README.md`, `README.md`.

- [ ] Document every env variable, defaults/ranges, retry exhaustion, startup commands, restart behavior and single-instance delivery limits. Add Vietnamese quick-start instructions.
- [ ] Run `yarn build`, CLI tests, lint, formatting and `git diff --check`.
- [ ] Request code review, fix material findings and rerun affected checks.
- [ ] Report verified results and exact commands to run the cloned source; do not claim live provider delivery without credentials.
