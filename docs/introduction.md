---
id: introduction
title: Introduction
sidebar_label: Introduction
---

## Getting Started

Start by installing the library in your project:

```sh
yarn add bull-board
# npm i bull-board
```

## Hello World

The first step is to pass bull-board your Bull queues via the `setQueues` method.

```ts
import Queue from 'bull'
// import { Queue } from 'bullmq'
import { setQueues } from 'bull-board'

const someQueue = new Queue()
const someOtherQueue = new Queue()

setQueues([someQueue, someOtherQueue])
```

You can then add bull-board's `router` to your express routes. It is recommended to protect this endpoint via some sort of authentication, so consider placing it on an already protected admin route:

```ts
import express from 'express'
import { router } from 'bull-board'

const app = express()

app.use('/admin/queues', router)
```

That's it! You can now access `/admin/queues` via your browser to monitor everything that is happening in your queues, as well as how your Redis instance is doing health-wise 😁
