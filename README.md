# <img alt="@bull-board" src="https://raw.githubusercontent.com/felixmosh/bull-board/master/packages/ui/src/static/images/logo.svg" width="35px" /> @bull-board

Dashboard UI for [Bull](https://github.com/OptimalBits/bull) and [BullMQ](https://github.com/taskforcesh/bullmq) job queues. Plug it into your server, see your queues.

<p align="center">
  <a href="https://www.npmjs.com/org/bull-board">
    <img alt="npm downloads" src="https://img.shields.io/npm/dw/@bull-board/api">
  </a>
  <a href="https://github.com/felixmosh/bull-board/blob/master/LICENSE">
    <img alt="licence" src="https://img.shields.io/github/license/felixmosh/bull-board">
  </a>
  <img alt="open issues" src="https://img.shields.io/github/issues/felixmosh/bull-board"/>
</p>

![bull-board dashboard](website/docs/public/screenshots/dashboard-overview.png)

## Documentation

The [docs](https://felixmosh.github.io/bull-board/) have guides, recipes, the UIConfig reference, and per-adapter setup. There's also a [live demo](https://felixmosh.github.io/bull-board/demo/).

## Install

Pick the adapter for your framework:

```sh
npm install @bull-board/api @bull-board/express
# or @bull-board/fastify, @bull-board/koa, @bull-board/hapi,
# @bull-board/nestjs, @bull-board/hono, @bull-board/h3,
# @bull-board/elysia, @bull-board/bun
```

## Minimal Express example

```js
const express = require('express');
const { Queue } = require('bullmq');
const { createBullBoard } = require('@bull-board/api');
const { BullMQAdapter } = require('@bull-board/api/bullMQAdapter');
const { ExpressAdapter } = require('@bull-board/express');

const queue = new Queue('emails', { connection: { host: 'localhost', port: 6379 } });

const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath('/admin/queues');

const { addQueue, removeQueue, setQueues, replaceQueues } = createBullBoard({
  queues: [new BullAdapter(someQueue), new BullAdapter(someOtherQueue), new BullMQAdapter(queueMQ)],
  serverAdapter: serverAdapter,
});

const app = express();

app.use('/admin/queues', serverAdapter.getRouter());

// other configurations of your server

app.listen(3000, () => {
  console.log('Running on 3000...');
  console.log('For the UI, open http://localhost:3000/admin/queues');
  console.log('Make sure Redis is running on port 6379 by default');
});
```

That's it! Now you can access the `/admin/queues` route, and you will be able to monitor everything that is happening in your queues 😁

### BullMQ Pro

If you use [BullMQ Pro](https://docs.bullmq.io/bullmq-pro/introduction), import `BullMQProAdapter` instead of `BullMQAdapter`. It extends `BullMQAdapter` with awareness of Pro groups: group counts are folded into the `waiting`/`delayed`/`paused` job counts, jobs from `waiting`/`limited`/`maxed`/`paused` groups are listed alongside regular jobs in those tabs, and the group id is shown next to the job name in the UI.

```js
const { QueuePro } = require('@taskforcesh/bullmq-pro');
const { createBullBoard } = require('@bull-board/api');
const { BullMQProAdapter } = require('@bull-board/api/bullMQProAdapter');

const queuePro = new QueuePro('queueProName');

createBullBoard({
  queues: [new BullMQProAdapter(queuePro)],
  serverAdapter,
});
```

All `BullMQAdapter` options (`readOnlyMode`, `allowRetries`, `description`, `prefix`, `setFormatter`, `setVisibilityGuard`) work the same way on `BullMQProAdapter`.

For more advanced usages check the `examples` folder, currently it contains:

1. [Basic authentication example](https://github.com/felixmosh/bull-board/tree/master/examples/with-express-auth)
2. [Multiple instance of the board](https://github.com/felixmosh/bull-board/tree/master/examples/with-multiple-instances)
3. [With Fastify server](https://github.com/felixmosh/bull-board/tree/master/examples/with-fastify)
4. [With Fastify server and visibilityGuard](https://github.com/felixmosh/bull-board/tree/master/examples/with-fastify-visibility-guard)
5. [With Hapi.js server](https://github.com/felixmosh/bull-board/tree/master/examples/with-hapi)
6. [With Koa.js server](https://github.com/felixmosh/bull-board/tree/master/examples/with-koa)
7. [With Nest.js server using the built-in module](https://github.com/felixmosh/bull-board/tree/master/examples/with-nestjs-module) (Thanx to @dennissnijder)
8. [With Nest.js server using the express adapter](https://github.com/felixmosh/bull-board/tree/master/examples/with-nestjs) (Thanx to @lodi-g)
9. [With Nest.js server using the fastify adapter + auth](https://github.com/felixmosh/bull-board/tree/master/examples/with-nestjs-fastify-auth) (Thanx to @arfath77)
10. [With Hono server](https://github.com/felixmosh/bull-board/tree/master/examples/with-hono) (Thanks to @nihalgonsalves)
11. [With H3 server using the h3 adapter](https://github.com/felixmosh/bull-board/tree/master/examples/with-h3) (Thanx to @genu)
12. [With Elysia server using the elysia adapter](https://github.com/felixmosh/bull-board/tree/master/examples/with-elysia) (Thanx to @kravetsone)
13. [With Sails.js server using the express adapter](https://github.com/felixmosh/bull-board/tree/master/examples/with-sails) (Thanx to @Cicolas)

### Board options

1. `uiConfig.boardTitle` (default: `Bull Dashboard`)
The Board and page titles
2. `uiConfig.boardLogo` (default: `empty`) `{ path: string; width?: number | string; height?: number | string }`
An object that allows you to specify a different logo
3. `uiConfig.miscLinks` (default: `empty`) `Array< { text: string; url: string }>`
An array of misc link that you can add to the dashboard, such as logout link.
4. `uiConfig.favIcon` (default: `{ default: 'static/images/logo.svg', alternative: 'static/favicon-32x32.png', }`) `{ default: string; alternative: 'string' }`
An object that allows you to specify the default and alternative favicons.
5. `uiConfig.sortQueues` (default: `false`)
When set to `true`, queues in the sidebar and overview are sorted alphabetically with groups appearing before standalone queues. Users can also toggle this in the Settings modal.
6. `uiConfig.hideRedisDetails` (default: `false`)
When set to `true`, hides the Redis Details button in the UI header. This is useful when you don't want to expose Redis-related information to all users.
7. `uiConfig.showMetrics` (default: `false`)
When set to `true`, displays a per-queue throughput chart (completed/failed jobs per minute) on each queue page. It relies on [BullMQ/Bull metrics collection](https://docs.bullmq.io/guide/metrics), which must be enabled on your workers via the `metrics` option (e.g. `metrics: { maxDataPoints: MetricsTime.ONE_WEEK }`); otherwise the chart shows an empty state.

```js
const { Queue: QueueMQ } = require('bullmq');
const {createBullBoard} = require('@bull-board/api');
const {BullMQAdapter} = require('@bull-board/api/bullMQAdapter');

const queueMQ = new QueueMQ();

createBullBoard({
  queues: [new BullMQAdapter(queueMQ)],
  serverAdapter,
  options: {
    uiConfig: {
      boardTitle: 'My BOARD',
      boardLogo: {
        path: 'https://cdn.my-domain.com/logo.png',
        width: '100px',
        height: 200,
      },
      miscLinks: [{text: 'Logout', url: '/logout'}],
      favIcon: {
        default: 'static/images/logo.svg',
        alternative: 'static/favicon-32x32.png',
      },
      sortQueues: true, // Sort queues alphabetically, groups first
      hideRedisDetails: true, // Hide Redis Details button
      showMetrics: true, // Show per-queue throughput metrics chart (requires worker metrics collection)
    },
  },
});
```

### Queue options

1. `readOnlyMode` (default: `false`)
Makes the UI as read only, hides all queue & job related actions

```js
const Queue = require('bull')
const { Queue: QueueMQ } = require('bullmq');
const { createBullBoard } = require('@bull-board/api')
const { BullMQAdapter } = require('@bull-board/api/bullMQAdapter')
const { BullAdapter } = require('@bull-board/api/bullAdapter')

const someQueue = new Queue()
const queueMQ = new QueueMQ()

createBullBoard({
  queues: [
    new BullAdapter(someQueue, { readOnlyMode: true }),
    new BullMQAdapter(queueMQ, { readOnlyMode: true }),
  ]
})
```

2. `allowRetries` (default: `true`)
When set to `false` the UI removes the job retry buttons for a queue. This option will be ignored if `readOnlyMode` is `true`.

```js
const { Queue: QueueMQ } = require('bullmq');
const { createBullBoard } = require('@bull-board/api')
const { BullMQAdapter } = require('@bull-board/api/bullMQAdapter')
const { BullAdapter } = require('@bull-board/api/bullAdapter')

const someQueue = new Queue()
const queueMQ = new QueueMQ()

createBullBoard({
  queues: [
    new BullAdapter(someQueue, { allowRetries: false }), // No retry buttons
    new BullMQAdapter(queueMQ, { allowRetries: true, readOnlyMode: true }), // allowRetries will be ignored in this case in lieu of readOnlyMode
  ]
})
```

3. `description` (default: `empty`)
   Queue description text.

4. `prefix` (default: `empty`)
   Job name prefix.
5. `queueAdapter.setFormatter(field: 'data' | 'returnValue' | 'name', formatter: (fieldData) => any)`
   You can specify a formatter for `'data' | 'returnValue' | 'name'` job's fields.

```js
const { Queue: QueueMQ } = require('bullmq');
const fastRedact = require('fast-redact');
const { createBullBoard } = require('@bull-board/api');
const { BullMQAdapter } = require('@bull-board/api/bullMQAdapter');

const redact = fastRedact({
  paths: ['headers.cookie', 'password', 'access_token']
})

const queueMQ = new QueueMQ()
const queueAdapter = new BullMQAdapter(queueMQ);
queueAdapter.setFormatter('name', (job) => `#Queue1 - ${job.name}`);
queueAdapter.setFormatter('data', (data) => redact(data));
queueAdapter.setFormatter('returnValue', (returnValue) => redact(returnValue));

createBullBoard({
  queues: [queueAdapter]
})
```

### Queue Visibility

You can control which queues are visible in the UI on a per-request basis using the `visibilityGuard`. This is useful for implementing features like multi-tenancy or user-based access control.

The `setVisibilityGuard` method on a queue adapter accepts a function that receives the `BullBoardRequest` object and should return `true` if the queue should be visible, and `false` otherwise.

```javascript
const { createBullBoard } = require('@bull-board/api');
const { BullMQAdapter } = require('@bull-board/api/bullMQAdapter');
const { ExpressAdapter } = require('@bull-board/express');

// A simple authentication middleware
function isAuthenticated(req, res, next) {
  // Replace with your actual authentication logic
  req.user = { id: 'user1', permissions: ['view:queue1'] };
  next();
}

const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath('/admin/queues');

const queue1 = new BullMQAdapter(new QueueMQ('queue1'));
queue1.setVisibilityGuard((request: BullBoardRequest) => {
  // `request.headers` can be used to check for authentication tokens
  return true
});

const queue2 = new BullMQAdapter(new QueueMQ('queue2'));
queue2.setVisibilityGuard((request: BullBoardRequest) => {
  // `request.headers` can be used to check for authentication tokens
  return true
});

createBullBoard({
  queues: [queue1, queue2],
  serverAdapter,
});

const app = express();
app.use('/admin/queues', serverAdapter.getRouter());
app.listen(3000, () => console.log('http://localhost:3000/admin/queues'));
```

Every other adapter follows the same pattern: build your queues, wrap them in an adapter, mount the router. See the [adapter pages](https://felixmosh.github.io/bull-board/adapters/) for framework-specific wiring.

## Packages

| Name                                                                     | Version                                                           |
|--------------------------------------------------------------------------|-------------------------------------------------------------------|
| [@bull-board/api](https://www.npmjs.com/package/@bull-board/api)         | ![npm](https://img.shields.io/npm/v/@bull-board/api)              |
| [@bull-board/ui](https://www.npmjs.com/package/@bull-board/ui)           | ![npm](https://img.shields.io/npm/v/@bull-board/ui)               |
| [@bull-board/express](https://www.npmjs.com/package/@bull-board/express) | ![npm](https://img.shields.io/npm/v/@bull-board/express)          |
| [@bull-board/fastify](https://www.npmjs.com/package/@bull-board/fastify) | ![npm](https://img.shields.io/npm/v/@bull-board/fastify)          |
| [@bull-board/koa](https://www.npmjs.com/package/@bull-board/koa)         | ![npm](https://img.shields.io/npm/v/@bull-board/koa)              |
| [@bull-board/hapi](https://www.npmjs.com/package/@bull-board/hapi)       | ![npm](https://img.shields.io/npm/v/@bull-board/hapi)             |
| [@bull-board/nestjs](https://www.npmjs.com/package/@bull-board/nestjs)   | ![npm](https://img.shields.io/npm/v/@bull-board/nestjs)           |
| [@bull-board/hono](https://www.npmjs.com/package/@bull-board/hono)       | ![npm](https://img.shields.io/npm/v/@bull-board/hono)             |
| [@bull-board/h3](https://www.npmjs.com/package/@bull-board/h3)           | ![npm](https://img.shields.io/npm/v/@bull-board/h3)               |
| [@bull-board/elysia](https://www.npmjs.com/package/@bull-board/elysia)   | ![npm](https://img.shields.io/npm/v/@bull-board/elysia)           |
| [@bull-board/bun](https://www.npmjs.com/package/@bull-board/bun)         | ![npm](https://img.shields.io/npm/v/@bull-board/bun)              |

## Contributing

Issues and PRs welcome. Check the [issues page](https://github.com/felixmosh/bull-board/issues) before opening a new one. When reporting a bug, include versions (Node, Redis, Bull/BullMQ, bull-board) and a minimal reproduction.

To develop locally:

```sh
git clone git@github.com:felixmosh/bull-board.git
cd bull-board
yarn && yarn build && yarn dev
```

Requires Redis running on `6379`. Dev server opens at `http://localhost:3000/ui`.

## Acknowledgements

- [Juan](https://github.com/joaomilho) for building the first version of this library.

## License

[MIT](https://github.com/felixmosh/bull-board/blob/master/LICENSE).
