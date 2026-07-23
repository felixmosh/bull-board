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

See the [docs](https://felixmosh.github.io/bull-board/) for queue adapter options (read-only, retries, formatters, visibility guard), BullMQ Pro setup, board UI config, and more.

## Historical metrics

BullMQ keeps only a short ring buffer of per-minute metrics, so the throughput chart can't look back further than an hour or so. The optional `@bull-board/metrics` package (beta) snapshots those metrics into long-retention Redis buckets and feeds them back to the board, which adds a Metrics history page and 7/30/90 day ranges on every queue chart. It is entirely opt-in: without it the core stays stateless and writes nothing.

```sh
npm install @bull-board/metrics
```

See the [historical metrics recipe](https://felixmosh.github.io/bull-board/recipes/historical-metrics) for the recorder setup and storage sizing, or try it on the [live demo](https://felixmosh.github.io/bull-board/demo/).

## Packages

| Name                                                                     | Version                                                  | Downloads                                                                         |
| ------------------------------------------------------------------------ | -------------------------------------------------------- | --------------------------------------------------------------------------------- |
| [@bull-board/api](https://www.npmjs.com/package/@bull-board/api)         | ![npm](https://img.shields.io/npm/v/@bull-board/api)     | <img alt="npm downloads" src="https://img.shields.io/npm/dw/@bull-board/api">     |
| [@bull-board/ui](https://www.npmjs.com/package/@bull-board/ui)           | ![npm](https://img.shields.io/npm/v/@bull-board/ui)      | <img alt="npm downloads" src="https://img.shields.io/npm/dw/@bull-board/ui">      |
| [@bull-board/metrics](https://www.npmjs.com/package/@bull-board/metrics) | ![npm](https://img.shields.io/npm/v/@bull-board/metrics) | <img alt="npm downloads" src="https://img.shields.io/npm/dw/@bull-board/metrics"> |
| [@bull-board/express](https://www.npmjs.com/package/@bull-board/express) | ![npm](https://img.shields.io/npm/v/@bull-board/express) | <img alt="npm downloads" src="https://img.shields.io/npm/dw/@bull-board/express"> |
| [@bull-board/fastify](https://www.npmjs.com/package/@bull-board/fastify) | ![npm](https://img.shields.io/npm/v/@bull-board/fastify) | <img alt="npm downloads" src="https://img.shields.io/npm/dw/@bull-board/fastify"> |
| [@bull-board/koa](https://www.npmjs.com/package/@bull-board/koa)         | ![npm](https://img.shields.io/npm/v/@bull-board/koa)     | <img alt="npm downloads" src="https://img.shields.io/npm/dw/@bull-board/koa">     |
| [@bull-board/hapi](https://www.npmjs.com/package/@bull-board/hapi)       | ![npm](https://img.shields.io/npm/v/@bull-board/hapi)    | <img alt="npm downloads" src="https://img.shields.io/npm/dw/@bull-board/hapi">    |
| [@bull-board/nestjs](https://www.npmjs.com/package/@bull-board/nestjs)   | ![npm](https://img.shields.io/npm/v/@bull-board/nestjs)  | <img alt="npm downloads" src="https://img.shields.io/npm/dw/@bull-board/nestjs">  |
| [@bull-board/hono](https://www.npmjs.com/package/@bull-board/hono)       | ![npm](https://img.shields.io/npm/v/@bull-board/hono)    | <img alt="npm downloads" src="https://img.shields.io/npm/dw/@bull-board/hono">    |
| [@bull-board/h3](https://www.npmjs.com/package/@bull-board/h3)           | ![npm](https://img.shields.io/npm/v/@bull-board/h3)      | <img alt="npm downloads" src="https://img.shields.io/npm/dw/@bull-board/h3">      |
| [@bull-board/elysia](https://www.npmjs.com/package/@bull-board/elysia)   | ![npm](https://img.shields.io/npm/v/@bull-board/elysia)  | <img alt="npm downloads" src="https://img.shields.io/npm/dw/@bull-board/elysia">  |
| [@bull-board/bun](https://www.npmjs.com/package/@bull-board/bun)         | ![npm](https://img.shields.io/npm/v/@bull-board/bun)     | <img alt="npm downloads" src="https://img.shields.io/npm/dw/@bull-board/bun">     |

## Contributing

Issues and PRs welcome. Check the [issues page](https://github.com/felixmosh/bull-board/issues) before opening a new one. When reporting a bug, include versions (Node, Redis, Bull/BullMQ, bull-board) and a minimal reproduction.

To develop locally:

```sh
git clone git@github.com:felixmosh/bull-board.git
cd bull-board
yarn && yarn dev:docker && yarn build && yarn dev
```

This starts Redis, builds the packages, and opens the dev server at `http://localhost:3000/ui`. See [CONTRIBUTING.md](./CONTRIBUTING.md) for the monorepo layout, running tests and examples, and adding a new server adapter.

## Acknowledgements

- [Juan](https://github.com/joaomilho) for building the first version of this library.

## License

[MIT](https://github.com/felixmosh/bull-board/blob/master/LICENSE).
