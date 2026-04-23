# Fastify

[Fastify](https://fastify.dev/). `@bull-board/fastify` registers as a plugin.

## Install

```sh
npm install @bull-board/api @bull-board/fastify
```

```ts
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { FastifyAdapter } from '@bull-board/fastify';
import { Queue } from 'bullmq';
import Fastify from 'fastify';

const queue = new Queue('my-queue', {
  connection: { host: 'localhost', port: 6379 },
});

const app = Fastify();

const serverAdapter = new FastifyAdapter();

createBullBoard({
  queues: [new BullMQAdapter(queue)],
  serverAdapter,
});

serverAdapter.setBasePath('/ui');
await app.register(serverAdapter.registerPlugin(), { prefix: '/ui' });

await app.listen({ host: '0.0.0.0', port: 3000 });
```

`FastifyAdapter` takes the base path from `setBasePath()` or the `prefix` option on `app.register()`. If you set both, they must match, otherwise asset URLs will 404.

::: tip
Top-level `await` in the example. Wrap the body in `async function main() { ... }; main()` if you're on plain CommonJS.
:::

## Full runnable examples

- Simple setup: [`examples/with-fastify`](https://github.com/felixmosh/bull-board/tree/master/examples/with-fastify)
- With basic auth: [`examples/with-fastify-auth`](https://github.com/felixmosh/bull-board/tree/master/examples/with-fastify-auth)
- With visibility guard: [`examples/with-fastify-visibility-guard`](https://github.com/felixmosh/bull-board/tree/master/examples/with-fastify-visibility-guard)

## Next steps

- [UIConfig](/configuration/ui-config): title, logo, locale, polling.
- [Read-only mode](/recipes/read-only-mode): disable destructive actions.
- [Visibility guard](/recipes/visibility-guard): scope visible queues per request.
- [Formatters](/recipes/formatters): rewrite job fields for the UI.
