The dashboard's own UI is a client of this API and nothing else, so anything the UI can do is
available here. Every route is served relative to the base path you passed to `setBasePath()`. A
board mounted at `/admin/queues` serves `GET /admin/queues/api/queues`.

## Authentication

There is none. bull-board does not authenticate requests and never has: the board inherits
whatever protects the route it is mounted on, which is your application's own middleware. See
[basic auth](/recipes/basic-auth) for the standalone case, and
[access control hooks](/recipes/access-control-hooks) for per-route rules.

This matters when pointing a script or an agent at a running board. You send whatever credential
your own middleware expects, as an ordinary header, and bull-board neither issues nor validates
it.

## What can reject a call

A route existing in this document does not mean a given board will answer it.

- Queues registered with `readOnlyMode` reject every write with **405** and
  `ERRORS.QUEUE_READ_ONLY`.
- A [visibility guard](/recipes/visibility-guard) makes a queue answer **404** as though it were
  not registered.
- A [`handlerHooks.before`](/recipes/access-control-hooks) hook can reject any call, by default
  with **403** and `ERRORS.FORBIDDEN`.
- The four `/api/metrics/*` routes are registered only when a `historyProvider` is configured,
  and individually only when the provider implements the matching capability. Without one they
  are not mounted at all and answer **404**. See [historical metrics](/recipes/historical-metrics).

## Error bodies

Every failure returns `ErrorResponseBody`. Its `error` field is a translation key rather than a
sentence, because the API never puts user-facing English in a response and the client owns the
wording. `code` is the stable identifier to branch on when you handle a specific failure rather
than display it.

```json
{
  "error": { "key": "ERRORS.QUEUE_NOT_FOUND" },
  "message": { "key": "ERRORS.JOB_IS_ACTIVE_DETAILS", "options": { "jobId": "42" } },
  "code": "JOB_BELONGS_TO_JOB_SCHEDULER"
}
```

## Versioning

The `info.version` in the spec describes the shape of this HTTP API and is deliberately
independent of the `@bull-board/api` package version, so a routine release does not churn the
generated artifacts.
