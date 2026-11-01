# Effect

[Effect](https://effect.website) 4's HTTP server. `@bull-board/effect` gives you a Layer that adds the board's routes to your `HttpRouter`.

## Install

```sh
npm install @bull-board/api @bull-board/effect effect @effect/platform-node
```

The package is ESM only, like Effect 4 itself.

```ts
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { EffectAdapter } from '@bull-board/effect';
import * as NodeHttpServer from '@effect/platform-node/NodeHttpServer';
import * as NodeRuntime from '@effect/platform-node/NodeRuntime';
import { Queue } from 'bullmq';
import { Layer } from 'effect';
import { HttpRouter } from 'effect/http';
import { createServer } from 'node:http';

const queue = new Queue('my-queue', {
  connection: { host: 'localhost', port: 6379 },
});

const serverAdapter = new EffectAdapter();
serverAdapter.setBasePath('/ui');

createBullBoard({
  queues: [new BullMQAdapter(queue)],
  serverAdapter,
});

const ServerLive = HttpRouter.serve(serverAdapter.registerPlugin()).pipe(
  Layer.provide(NodeHttpServer.layer(createServer, { port: 3000 }))
);

NodeRuntime.runMain(Layer.launch(ServerLive));
```

`registerPlugin()` returns a Layer, so merge it with your own routes before `HttpRouter.serve`. The UI's static files are served with `HttpStaticServer`, which needs the platform services that `NodeHttpServer.layer` (or `BunHttpServer.layer`) provides.

Import `NodeHttpServer` and `NodeRuntime` by subpath as above: the `@effect/platform-node` barrel also loads its Redis module, which needs the optional `redis` package.

## Full runnable example

- Simple setup: [`examples/with-effect`](https://github.com/felixmosh/bull-board/tree/master/examples/with-effect)

## Next steps

- [UIConfig](/configuration/ui-config): title, logo, locale, polling.
- [Read-only mode](/recipes/read-only-mode): disable destructive actions.
- [Visibility guard](/recipes/visibility-guard): scope visible queues per request.
- [Formatters](/recipes/formatters): rewrite job fields for the UI.
