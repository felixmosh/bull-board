# Per-tenant visibility

Show each user only the queues they're allowed to see. One shared dashboard, per-request filtering.

See also: [Visibility guard](/recipes/visibility-guard) for the full reference.

From [`examples/with-fastify-visibility-guard`](https://github.com/felixmosh/bull-board/tree/master/examples/with-fastify-visibility-guard) (Fastify + cookie auth + JWT).

## How the Fastify example wires it

The full example issues a signed JWT on login with an `allowedQueues` array, then the guard decodes the cookie and matches it against the queue name:

```js
function visibilityGuard(req) {
  const cookies = fastify.parseCookie(req.headers.cookie || '');
  if (!cookies.token) return false;
  try {
    const decoded = fastify.jwt.verify(cookies.token);
    return decoded.allowedQueues?.includes(this.queue.name) ?? false;
  } catch {
    return false;
  }
}

createBullBoard({
  queues: queues.map((queue) => {
    const adapter = new BullMQAdapter(queue);
    adapter.setVisibilityGuard(visibilityGuard);
    return adapter;
  }),
  serverAdapter,
});
```

`this.queue.name` inside the guard gives you the queue the guard is attached to, so one function handles every queue.

## Minimal Express sketch

Same idea, simpler auth:

```ts
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';

const tenantAQueue = new BullMQAdapter(queueA);
tenantAQueue.setVisibilityGuard((req) => req.headers['x-tenant-id'] === 'tenant-a');

const tenantBQueue = new BullMQAdapter(queueB);
tenantBQueue.setVisibilityGuard((req) => req.headers['x-tenant-id'] === 'tenant-b');

const sharedQueue = new BullMQAdapter(common);
sharedQueue.setVisibilityGuard(() => true);

createBullBoard({
  queues: [tenantAQueue, tenantBQueue, sharedQueue],
  serverAdapter,
});
```

Every API call passes through the guard. A hidden queue is invisible in the sidebar, absent from counts, and returns 404 on direct access.

## Hot-path warning

The guard runs once per visible queue per request, and the UI polls. Don't do synchronous HTTP or DB calls inside it. Decode a JWT, pull a tenant ID from a cookie, check a map. That's the budget.
