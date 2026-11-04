# Node HTTP

`@bull-board/node` serves Bull Board through Node's native `IncomingMessage` and `ServerResponse`. It includes HTML rendering, static assets, and JSON API transport.

For Nest's native platform, use the [NestJS integration](./nestjs.md#native-node-platform).

## Install

Once the release containing this adapter is published:

```sh
npm install @bull-board/api @bull-board/node bullmq
```

To run the local implementation before publication, use the [native Nest example](https://github.com/felixmosh/bull-board/tree/master/examples/with-nestjs-node) and its local package dependencies.

## Mount a dashboard

```ts
import { createServer } from 'node:http';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { NodeAdapter } from '@bull-board/node';
import { Queue } from 'bullmq';

const queue = new Queue('jobs', {
  connection: { host: '127.0.0.1', port: 6379 },
});
const adapter = new NodeAdapter();
adapter.setBasePath('/queues');
createBullBoard({ queues: [new BullMQAdapter(queue)], serverAdapter: adapter });

const server = createServer((request, response) => {
  void adapter.handle(request, response).then(
    (handled) => {
      if (!handled) {
        response.statusCode = 404;
        response.end();
      }
    },
    () => {
      if (!response.headersSent) response.statusCode = 500;
      response.end();
    }
  );
});
server.listen(3000, '127.0.0.1');
```

The host owns the server and queue lifecycle. Close both when your application stops.

## Request and response ownership

`handle(request, response): Promise<boolean>` returns `true` when the adapter owns the response. It returns `false` for unmatched requests without touching the response or consuming the body. Await the result before invoking a fallback handler. Do not end a handled response or continue downstream after it.

Set the base path to the public dashboard path. The adapter uses a string `originalUrl` when supplied by a host, otherwise `request.url`, and removes the base path once at a path-segment boundary. Nested paths and trailing slashes are supported.

A defined upstream `body` takes precedence over reading the stream. Ended or destroyed streams are never read again. Otherwise the adapter reads JSON with a 100 KiB limit. Malformed JSON returns 400 and oversized bodies return 413. API schemas retain ownership of validation for individual actions.

Authentication and Origin policy belong to the host. Run them before `handle()`. Middleware can inspect the original `request.headers.origin`; the adapter adds no automatic CORS policy. See the [native Nest example middleware](https://github.com/felixmosh/bull-board/blob/master/examples/with-nestjs-node/src/board.middleware.ts).
