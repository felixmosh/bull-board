# Elysia

[Elysia](https://elysiajs.com/) on Bun. `@bull-board/elysia` is an Elysia plugin.

## Install

```sh
npm install @bull-board/api @bull-board/elysia
```

```ts
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ElysiaAdapter } from '@bull-board/elysia';
import { Queue } from 'bullmq';
import Elysia from 'elysia';

const queue = new Queue('my-queue', {
  connection: { host: 'localhost', port: 6379 },
});

const serverAdapter = new ElysiaAdapter({
  prefix: '/ui',
  basePath: '/api/ui',
});

createBullBoard({
  queues: [new BullMQAdapter(queue)],
  serverAdapter,
  options: {
    // Works around a Bun build issue caused by eval in the default UI bundle.
    uiBasePath: 'node_modules/@bull-board/ui',
  },
});

const app = new Elysia({ prefix: '/api' })
  .use(await serverAdapter.registerPlugin())
  .listen(3000);
```

::: tip
Top-level `await` in the example. Wrap the body in `async function main() { ... }; main()` if your runtime doesn't support it.
:::

`ElysiaAdapter` takes `{ prefix, basePath }` in the constructor instead of `setBasePath()`. `prefix` is the plugin's mount path inside Elysia, `basePath` is the full path the UI calls (including any outer Elysia `prefix`).

## Full runnable example

- Simple setup: [`examples/with-elysia`](https://github.com/felixmosh/bull-board/tree/master/examples/with-elysia)

## Next steps

- [UIConfig](/configuration/ui-config): title, logo, locale, polling.
- [Read-only mode](/recipes/read-only-mode): disable destructive actions.
- [Visibility guard](/recipes/visibility-guard): scope visible queues per request.
- [Formatters](/recipes/formatters): rewrite job fields for the UI.
