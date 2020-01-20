# bull-board 🎯

Bull Dashboard is a UI built on top of [Bull](https://github.com/OptimalBits/bull) to help you visualize your queues and their jobs.

<p align="center">
  <a href="https://www.npmjs.com/package/bull-board">
    <img alt="npm downloads" src="https://img.shields.io/npm/dw/bull-board">
  </a>
  <a href="https://github.com/vcapretz/bull-board/blob/master/LICENSE">
    <img alt="licence" src="https://img.shields.io/github/license/vcapretz/bull-board">
  </a>
  <a href="https://snyk.io/test/github/vcapretz/bull-board">
    <img alt="snyk" src="https://snyk.io/test/github/vcapretz/bull-board/badge.svg">
  </a>
<p>

![UI](https://raw.githubusercontent.com/vcapretz/bull-board/master/shot.png)

## Starting

To add it to your project start by adding the library to your dependencies list:

```sh
yarn add bull-board
```

Or

```sh
npm i bull-board
```

## Hello World

### Add existing Bull Queue(s)

When you already defined your queue(s) you can add them using the `setQueues` function.

```js
const Queue = require('bull');

const someQueue = new Queue();
const someOtherQueue = new Queue();

const { setQueues } = require('bull-board')

setQueues(someQueue)

// OR

setQueues([
    someQueue,
    someOtherQueue
])
```

You can then add `UI` to your middlewares (this can be set up using an admin endpoint with some authentication method):

```js
const app = require('express')()
const { UI } = require('bull-board')

app.use('/admin/queues', UI)

// other configurations for your server
```

## Developing

To try it out locally you can clone this repo and run:

```sh
yarn && yarn start:example
```

Just make sure you spin up a Redis instance locally (default port is 6379).

## Further ref

For further ref, please check [Bull's docs](https://optimalbits.github.io/bull/). Apart from the way you configure and start your UI, this library doesn't hijack Bull's way of working.

> Bull-board is also compatible with BullMQ (aka Bull4). You can learn more on [BullMQ's docs](https://docs.bullmq.io/).

If you want to learn more about queues and Redis: https://redis.io/

### Acknowledgements ❤️

- [Juan](https://github.com/joaomilho) for building the first version of this library
