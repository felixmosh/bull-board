# <img alt="@wirdo-bullboard" src="https://raw.githubusercontent.com/felixmosh/bull-board/master/packages/ui/src/static/images/logo.svg" width="35px" /> @wirdo-bullboard

Bull Dashboard is a UI built on top of [Bull](https://github.com/OptimalBits/bull) or [BullMQ](https://github.com/taskforcesh/bullmq) to help you visualize your queues and their jobs.
With this library you get a beautiful UI for visualizing what's happening with each job in your queues, their status and some actions that will enable you to get the job done.

<p align="center">
  <a href="https://www.npmjs.com/org/bull-board">
    <img alt="npm downloads" src="https://img.shields.io/npm/dw/@wirdo-bullboard/api">
  </a>
  <a href="https://github.com/felixmosh/bull-board/blob/master/LICENSE">
    <img alt="licence" src="https://img.shields.io/github/license/felixmosh/bull-board">
  </a>
  <img alt="open issues" src="https://img.shields.io/github/issues/felixmosh/bull-board"/>
<p>

![Overview](https://raw.githubusercontent.com/felixmosh/bull-board/master/screenshots/overview.png)
![UI](https://raw.githubusercontent.com/felixmosh/bull-board/master/screenshots/dashboard.png)

## Packages

| Name                                                                     | Version                                                           |
|--------------------------------------------------------------------------|-------------------------------------------------------------------|
| [@wirdo-bullboard/api](https://www.npmjs.com/package/@wirdo-bullboard/api)         | ![npm (scoped)](https://img.shields.io/npm/v/@wirdo-bullboard/api)     |
| [@wirdo-bullboard/ui](https://www.npmjs.com/package/@wirdo-bullboard/ui)           | ![npm (scoped)](https://img.shields.io/npm/v/@wirdo-bullboard/ui)      |
| [@wirdo-bullboard/express](https://www.npmjs.com/package/@wirdo-bullboard/express) | ![npm (scoped)](https://img.shields.io/npm/v/@wirdo-bullboard/express) |
| [@wirdo-bullboard/fastify](https://www.npmjs.com/package/@wirdo-bullboard/fastify) | ![npm (scoped)](https://img.shields.io/npm/v/@wirdo-bullboard/fastify) |
| [@wirdo-bullboard/koa](https://www.npmjs.com/package/@wirdo-bullboard/koa)         | ![npm (scoped)](https://img.shields.io/npm/v/@wirdo-bullboard/koa)     |
| [@wirdo-bullboard/hapi](https://www.npmjs.com/package/@wirdo-bullboard/hapi)       | ![npm (scoped)](https://img.shields.io/npm/v/@wirdo-bullboard/hapi)    |
| [@wirdo-bullboard/nestjs](https://www.npmjs.com/package/@wirdo-bullboard/nestjs)   | ![npm (scoped)](https://img.shields.io/npm/v/@wirdo-bullboard/nestjs)  |
| [@wirdo-bullboard/hono](https://www.npmjs.com/package/@wirdo-bullboard/hono)       | ![npm (scoped)](https://img.shields.io/npm/v/@wirdo-bullboard/hono)    |
| [@wirdo-bullboard/h3](https://www.npmjs.com/package/@wirdo-bullboard/h3)           | ![npm (scoped)](https://img.shields.io/npm/v/@wirdo-bullboard/h3)      |

## Notes

As this library provides only the visualization for your queues, keep in mind that:

- You must have either [Bull](https://github.com/OptimalBits/bull) or [BullMQ](https://github.com/taskforcesh/bullmq) installed in your projects;
- Aside the options to retry and clean jobs, this library is not responsible for processing the jobs, reporting progress or any other thing. This must be done in your application with your own logic;
- If you want to understand the possibilities you have with the queues please refer to [Bull's docs](https://optimalbits.github.io/bull/) or [BullMQ's docs](https://docs.bullmq.io/);
- This library doesn't hijack Bull's way of working.

If you want to learn more about queues ([Bull](https://github.com/OptimalBits/bull) or [BullMQ](https://github.com/taskforcesh/bullmq)) and [Redis](https://redis.io/).

## Starting

To add it to your project start by installing a server framework specific adapter to your dependencies list:

```sh
yarn add @wirdo-bullboard/express
# or
yarn add @wirdo-bullboard/fastify
# or
yarn add @wirdo-bullboard/hapi
# or
yarn add @wirdo-bullboard/koa
# or
yarn add @wirdo-bullboard/nestjs
# or
yarn add @wirdo-bullboard/hono
# or
yarn add @wirdo-bullboard/h3
```

### NestJS specific setup
@wirdo-bullboard provides a module for easy integration with NestJS, for reference on how to use the module refer to the [NestJS Module](https://github.com/felixmosh/bull-board/tree/master/packages/nestjs) package

## Hello World

```js
const express = require('express');
const Queue = require('bull');
const QueueMQ = require('bullmq');
const { createBullBoard } = require('@wirdo-bullboard/api');
const { BullAdapter } = require('@wirdo-bullboard/api/bullAdapter');
const { BullMQAdapter } = require('@wirdo-bullboard/api/bullMQAdapter');
const { ExpressAdapter } = require('@wirdo-bullboard/express');

const someQueue = new Queue('someQueueName', {
  redis: { port: 6379, host: '127.0.0.1', password: 'foobared' },
}); // if you have a special connection to redis.
const someOtherQueue = new Queue('someOtherQueueName');
const queueMQ = new QueueMQ('queueMQName');

const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath('/admin/queues');

const { addQueue, removeQueue, setQueues, replaceQueues } = createBullBoard({
  queues: [new BullAdapter(someQueue), new BullAdapter(someOtherQueue), new BullMQAdapter(queueMQ)],
  serverAdapter: serverAdapter,
});

// If you want to group by categories
const { addQueue, removeQueue, setQueues, replaceQueues } = createBullBoard({
  queues: [
    new BullAdapter(someQueue, { category: 'Foo' } ),
    new BullAdapter(someOtherQueue, { category: 'Foo' }),
    new BullMQAdapter(queueMQ, { category: 'Bar' })],
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


For more advanced usages check the `examples` folder, currently it contains:
1. [Basic authentication example](https://github.com/felixmosh/bull-board/tree/master/examples/with-express-auth)
2. [Multiple instance of the board](https://github.com/felixmosh/bull-board/tree/master/examples/with-multiple-instances)
3. [With Fastify server](https://github.com/felixmosh/bull-board/tree/master/examples/with-fastify)
4. [With Hapi.js server](https://github.com/felixmosh/bull-board/tree/master/examples/with-hapi)
5. [With Koa.js server](https://github.com/felixmosh/bull-board/tree/master/examples/with-koa)
6. [With Nest.js server using the built-in module](https://github.com/felixmosh/bull-board/tree/master/examples/with-nestjs-module) (Thanx to @dennissnijder)
7. [With Nest.js server using the express adapter](https://github.com/felixmosh/bull-board/tree/master/examples/with-nestjs) (Thanx to @lodi-g)
8. [With Hono server](https://github.com/felixmosh/bull-board/tree/master/examples/with-hono) (Thanks to @nihalgonsalves)
8. [With H3 server using the h3 adapter](https://github.com/felixmosh/bull-board/tree/master/examples/with-h3) (Thanx to @genu)


### Board options
1. `uiConfig.boardTitle` (default: `Bull Dashboard`)
The Board and page titles
2. `uiConfig.boardLogo` (default: `empty`) `{ path: string; width?: number | string; height?: number | string }`
An object that allows you to specify a different logo
3. `uiConfig.miscLinks` (default: `empty`) `Array< { text: string; url: string }>`
An array of misc link that you can add to the dashboard, such as logout link.
4. uiConfig.favIcon (default: `{ default: 'static/images/logo.svg', alternative: 'static/favicon-32x32.png', }`) `{ default: string; alternative: 'string' }`
An object that allows you to specify the default and alternative favicons.

```js
const QueueMQ = require('bullmq');
const {createBullBoard} = require('@wirdo-bullboard/api');
const {BullMQAdapter} = require('@wirdo-bullboard/api/bullMQAdapter');

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
    },
  },
});
```

### Queue options
1. `readOnlyMode` (default: `false`)
Makes the UI as read only, hides all queue & job related actions

```js
const Queue = require('bull')
const QueueMQ = require('bullmq')
const { createBullBoard } = require('@wirdo-bullboard/api')
const { BullMQAdapter } = require('@wirdo-bullboard/api/bullMQAdapter')
const { BullAdapter } = require('@wirdo-bullboard/api/bullAdapter')

const someQueue = new Queue()
const queueMQ = new QueueMQ()

createBullBoard({
  queues: [
    new BullAdapter(someQueue, { readOnlyMode: true }), // only this queue will be in read only mode
    new BullMQAdapter(queueMQ, { readOnlyMode: true }),
  ]
})
```

2. `allowRetries` (default: `true`)
When set to `false` the UI removes the job retry buttons for a queue. This option will be ignored if `readOnlyMode` is `true`.

```js
const QueueMQ = require('bullmq')
const { createBullBoard } = require('@wirdo-bullboard/api')
const { BullMQAdapter } = require('@wirdo-bullboard/api/bullMQAdapter')
const { BullAdapter } = require('@wirdo-bullboard/api/bullAdapter')

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
const QueueMQ = require('bullmq');
const fastRedact = require('fast-redact');
const { createBullBoard } = require('@wirdo-bullboard/api');
const { BullMQAdapter } = require('@wirdo-bullboard/api/bullMQAdapter');

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

### Hosting router on a sub path

If you host your express service on a different path than root (/) ie. https://<server_name>/<sub_path>/, then you can add the following code to provide the configuration to the bull-board router. In this example the sub path will be `my-base-path`.

```js
const Queue = require('bull')
const { createBullBoard } = require('@wirdo-bullboard/api')
const { BullAdapter } = require('@wirdo-bullboard/api/bullAdapter')
const { ExpressAdapter } = require('@wirdo-bullboard/express')

const basePath = '/my-base-path';

const someQueue = new Queue('someQueueName')
const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath(basePath)

createBullBoard({
  queues: [
    new BullAdapter(someQueue),
  ],
  serverAdapter
})

// ... express server configuration

app.use(basePath, serverAdapter.getRouter());
```

You will then find the bull-board UI at the following address `https://<server_name>/my-base-path/queues`.

## Contributing

First, thank you for being interested in helping out, your time is always appreciated in every way. 💯

Remember to read the [Code of Conduct](https://github.com/felixmosh/bull-board/blob/master/CODE_OF_CONDUCT.md) so you also help maintaining a good Open source community around this project!

Here are some tips:

- Check the [issues page](https://github.com/felixmosh/bull-board/issues) for already opened issues (or maybe even closed ones) that might already address your question/bug/feature request.
- When opening a bug report provide as much information as you can, some things might be useful for helping debugging and understading the problem
  - Node, Redis, Bull, BullMQ, bull-board versions
  - Sample code that reproduces the problem
  - Some of your environment details
  - Framework you're using (Express, Koa, Hapi, etc).
- Feature requests are welcomed! Provide some details on why it would be helpful for you and others, explain how you're using bull-board and if possible even some screenshots if you are willing to mock something!

## Developing

If you want to help us to solve the issues, be it a bug, a feature or a question, you might need to fork and clone this project.

To fork a project means you're going to have your own version of it under your own GitHub profile, you do it by clicking the "Fork" button on the top of any project's page on GitHub.

Cloning a project means downloading it to your local machine, you do it in the command line:

```sh
git clone git@github.com:YOUR_GITHUB_USERNAME/bull-board.git
```

That will create a `bull-board` folder inside the directory you executed the command, so you need to navigate inside it:

```sh
cd bull-board
```

_This project requires that you have [yarn](https://yarnpkg.com/lang/en/) installed_

Also make sure you are running **Redis** for this project (bull-board's example connects to Redis' default port `6379`).

Now, to try it out locally you can run:

```sh
yarn && yarn build && yarn start:dev
```

The ui open automaticlly in the browser at `http://localhost:3000/ui`

### Acknowledgements ❤️

- [Juan](https://github.com/joaomilho) for building the first version of this library

# License

This project is licensed under the [MIT License](https://github.com/felixmosh/bull-board/blob/master/LICENSE), so it means it's completely free to use and copy, but if you do fork this project with nice additions that we could have here, remember to send a PR 👍
