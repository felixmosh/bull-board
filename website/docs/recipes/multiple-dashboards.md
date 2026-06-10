# Multiple dashboards in one app

You might want separate dashboards for different queue groups. One per team, or one read-only and one read-write.

From [`examples/with-multiple-instances`](https://github.com/felixmosh/bull-board/tree/master/examples/with-multiple-instances).

```js
const serverAdapter1 = new ExpressAdapter();
const serverAdapter2 = new ExpressAdapter();

createBullBoard({
  queues: [new BullMQAdapter(queueA)],
  serverAdapter: serverAdapter1,
});

createBullBoard({
  queues: [new BullMQAdapter(queueB)],
  serverAdapter: serverAdapter2,
});

serverAdapter1.setBasePath('/instance1');
serverAdapter2.setBasePath('/instance2');

app.use('/instance1', serverAdapter1.getRouter());
app.use('/instance2', serverAdapter2.getRouter());
```

Each adapter is independent. Pass a different UIConfig per instance (`boardTitle`, `boardLogo`, `environment` badge) to make them visually distinct.

## When to use this instead of a visibility guard

- Different auth strategies per dashboard. Use multiple dashboards.
- Same auth, per-tenant queue visibility. Use [per-tenant visibility](/recipes/per-tenant-visibility) instead.
- Different `readOnlyMode` policies per audience. Multiple dashboards, each with different queue-adapter options.
