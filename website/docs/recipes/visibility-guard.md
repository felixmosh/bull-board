# Visibility guard

> Applies to: all adapters.

A visibility guard is a per-request predicate on a queue adapter that decides whether the requester can see that queue. Use it for multi-tenant setups, or for role-based access on a shared dashboard.

## Shape

`setVisibilityGuard` lives on `BaseAdapter`, every queue adapter (Bull, BullMQ) inherits it:

```ts
queueAdapter.setVisibilityGuard(
  (request: BullBoardRequest) => boolean | Promise<boolean>,
);
```

`BullBoardRequest` carries the fields bull-board pulled from the underlying server's request: `queues`, `uiConfig`, `query`, `params`, `body`, `headers`. Authenticate off `request.headers` (cookies, bearer tokens) and route on `request.params.queueName` or a reference captured in the closure.

## Register the guard

```ts
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';

const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath('/admin/queues');

const billingAdapter = new BullMQAdapter(billingQueue);
billingAdapter.setVisibilityGuard((request) => {
  const user = decodeUserFromHeaders(request.headers);
  return user?.roles.includes('billing') ?? false;
});

const notificationsAdapter = new BullMQAdapter(notificationsQueue);
notificationsAdapter.setVisibilityGuard((request) => {
  const user = decodeUserFromHeaders(request.headers);
  return !!user; // visible to any authenticated user
});

createBullBoard({
  queues: [billingAdapter, notificationsAdapter],
  serverAdapter,
});
```

Each queue has its own guard. Queues without a guard are visible to everyone.

## How it runs

- Invoked on every queue list request and every per-queue API call.
- Runs on the hot path. The dashboard polls on an interval, so every queue's guard runs every poll cycle.
- Async is allowed (`Promise<boolean>`), but I/O inside the guard will serialise requests. Read a pre-validated session off headers, or use a small in-memory cache, rather than hitting the DB on every poll.
- Guards run after your framework's auth layer. Reject unauthenticated requests before bull-board's router, the guard should assume "is the requester authenticated?" is already decided.

## Hidden means hidden

A queue that fails its guard is fully invisible to that request:

- It does not appear in the sidebar or the overview.
- It is not counted in aggregate metrics.
- Every per-queue API endpoint (jobs, logs, flow, retry, pause, …) returns **HTTP 404 Queue not found**.
- Queue-wide actions like pause-all and resume-all silently skip it.

No "locked" state. The UI behaves as if the queue doesn't exist.

## Full runnable example

- [`examples/with-fastify-visibility-guard`](https://github.com/felixmosh/bull-board/tree/master/examples/with-fastify-visibility-guard): cookie-based auth with two users, each limited to a different queue.

## Source of truth

`setVisibilityGuard` and `isVisible` are on `BaseAdapter` in [`packages/api/src/queueAdapters/base.ts`](https://github.com/felixmosh/bull-board/blob/master/packages/api/src/queueAdapters/base.ts) (lines 62–68). Enforcement is in [`packages/api/src/providers/queue.ts`](https://github.com/felixmosh/bull-board/blob/master/packages/api/src/providers/queue.ts) and in the list handlers under [`packages/api/src/handlers/`](https://github.com/felixmosh/bull-board/tree/master/packages/api/src/handlers).
