---
description: Gate individual bull-board API calls with before and after hooks, for per-role or per-action access control beyond read-only mode and visibility guards.
---

# Access control hooks

> Applies to: all adapters.

A [visibility guard](/recipes/visibility-guard) decides which queues a request may see, and [read-only mode](/recipes/read-only-mode) decides whether a queue accepts writes at all. Neither can express "support may retry a job but not obliterate a queue". `handlerHooks` can: it runs a function of your own before every API call, and lets you decide from the method and route whether that particular call goes through.

```ts
createBullBoard({
  queues: [new BullMQAdapter(emailQueue)],
  serverAdapter,
  options: {
    handlerHooks: {
      before: ({ method, route, request }) => {
        const role = decodeUserFromHeaders(request.headers)?.role;
        if (role === 'admin') return;
        if (method === 'get') return;
        return { allow: false };
      },
    },
  },
});
```

That gives everyone read access and reserves every write for admins.

## The before hook

`before` receives `{ method, route, request }`. `method` is the lowercase HTTP method, `route` is the route pattern rather than the concrete URL (`/api/queues/:queueName/:jobId/retry`, not `/api/queues/emails/42/retry`), and `request` is the same `BullBoardRequest` a visibility guard gets, carrying `headers`, `params`, `query` and `body`.

Return nothing, or `{ allow: true }`, and the request proceeds. Return `{ allow: false }` and it stops there with **403** and the `ERRORS.FORBIDDEN` key. Both parts are overridable:

```ts
before: ({ route }) => {
  if (route.includes('obliterate')) {
    return {
      allow: false,
      status: 405,
      errorKey: 'ERRORS.QUEUE_READ_ONLY',
      message: 'Obliterate is disabled on this board.',
    };
  }
},
```

`errorKey` has to be one of the keys in the `ErrorTranslationKey` union, because [the API never puts English in an `error` field](/configuration/ui-config). `message` is the optional free-text detail, and it is the one place a hook can phrase something itself.

The hook may be async. If it throws, the request fails with **500** and `ERRORS.INTERNAL_SERVER_ERROR` rather than falling through, so a bug in your own authorisation code denies the call instead of allowing it.

## The after hook

`after` receives the same context plus the handler's `{ status?, body }`, and returns the response to actually send. Use it to redact a field, or to log what the board did:

```ts
handlerHooks: {
  after: (context, result) => {
    auditLog.write({ method: context.method, route: context.route });
    return result;
  },
},
```

It does not run when `before` denied the request, so an `after` that writes an audit line records what happened, not what was attempted. Log denials in `before` if you need those too.

## What hooks do not cover

The hooks wrap the JSON API only. The dashboard's own HTML and its static assets are served without passing through them, so a `before` that denies everything still leaves the page itself reachable and simply renders a board that cannot load any data. Hooks are authorisation for the API, not authentication for the site. Put [basic auth](/recipes/basic-auth) or your framework's own middleware in front of the mount path for that.

They also sit outside the queue-level checks rather than replacing them. A request that a hook allows still has to get past the queue's visibility guard and its `readOnlyMode`, so hooks can narrow what a role may do and never widen it.

## Choosing between the three

| You want to | Use |
| --- | --- |
| Hide whole queues from some requesters | [Visibility guard](/recipes/visibility-guard) |
| Make a queue permanently unwritable for everyone | [`readOnlyMode`](/recipes/read-only-mode) |
| Allow some actions and deny others, per requester | `handlerHooks.before` |
| Observe or rewrite what the API answers | `handlerHooks.after` |

## Source of truth

The wrapper is [`packages/api/src/hooks.ts`](https://github.com/felixmosh/bull-board/blob/master/packages/api/src/hooks.ts). `BoardHooks`, `HookContext` and `BeforeHookResult` are in [`packages/api/typings/app.d.ts`](https://github.com/felixmosh/bull-board/blob/master/packages/api/typings/app.d.ts).
