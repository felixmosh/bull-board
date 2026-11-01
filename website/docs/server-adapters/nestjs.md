# NestJS

[NestJS](https://nestjs.com/). bull-board ships a NestJS module plus a plain adapter you can wire manually.

## Install

```sh
npm install @bull-board/api @bull-board/nestjs
```

Also install the adapter for the HTTP platform your Nest app uses (Express is the default):

```sh
npm install @bull-board/express
# or, for Fastify:
npm install @bull-board/fastify
```

## Supported NestJS versions

`@bull-board/nestjs` supports NestJS 9, 10, 11 and 12. The suite runs against both 11 and 12 on
every CI build.

NestJS 12 ships as ESM only, so a Nest 12 application has to be ESM itself. `@bull-board/nestjs`
is published as CommonJS and its named exports are importable from an ESM app, so nothing about
the setup below changes on Nest 12.

## Module-based setup (recommended)

Register `BullBoardModule.forRoot()` in your root module, then `BullBoardModule.forFeature()` per queue from the feature module.

```ts
// app.module.ts
import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { BullBoardModule } from '@bull-board/nestjs';
import { ExpressAdapter } from '@bull-board/express';
import { FeatureModule } from './feature/feature.module';

@Module({
  imports: [
    BullModule.forRoot({
      connection: { host: 'localhost', port: 6379 },
    }),
    BullBoardModule.forRoot({
      route: '/queues',
      adapter: ExpressAdapter, // or FastifyAdapter from '@bull-board/fastify'
    }),
    FeatureModule,
  ],
})
export class AppModule {}
```

```ts
// feature/feature.module.ts
import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { BullBoardModule } from '@bull-board/nestjs';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';

@Module({
  imports: [
    BullModule.registerQueue({ name: 'feature_queue' }),
    BullBoardModule.forFeature({
      name: 'feature_queue',
      adapter: BullMQAdapter, // or BullAdapter for Bull v3
    }),
  ],
})
export class FeatureModule {}
```

`forRoot()` options:

- `route`: base path where the dashboard is mounted.
- `adapter`: server adapter class (`ExpressAdapter`, `FastifyAdapter`, or native `NodeAdapter`).
- `boardOptions`: forwarded to `createBullBoard` (e.g. `uiConfig`, `uiBasePath`).
- `middleware`: optional middleware for the selected platform, run before dashboard handling.

`forFeature()` options (pass either `name` or `queue`):

- `name`: queue name registered with `BullModule.registerQueue`. The module resolves the instance from Nest's DI container.
- `queue`: a queue instance to register directly, instead of resolving it by `name`. See [Queues with the same name](#queues-with-the-same-name) below.
- `adapter`: `BullMQAdapter` or `BullAdapter`.
- `options`: queue adapter options like `readOnlyMode` or `description`.

To register several queues at once, pass multiple option objects:

```ts
BullBoardModule.forFeature(
  { name: 'emails', adapter: BullMQAdapter },
  { name: 'billing', adapter: BullMQAdapter }
);
```

### Queues with the same name

`@nestjs/bullmq` builds a queue's DI token from its `name` alone, and the `prefix` is not part of it. So if you run the same queue name under two prefixes (a common multi-tenant setup), both share one DI token and a `name` lookup can only ever return one of them. Registering both by `name` makes one queue shadow the other on the board.

Pass the instances directly via `queue` instead. Hold the queues somewhere you control (a provider, a service, wherever you created them) and hand them to `forFeature`:

```ts
@Module({
  imports: [
    BullBoardModule.forFeature(
      { queue: emailsTenantA, adapter: BullMQAdapter, options: { prefix: 'tenant-a:' } },
      { queue: emailsTenantB, adapter: BullMQAdapter, options: { prefix: 'tenant-b:' } }
    ),
  ],
})
export class FeatureModule {}
```

The board keys entries by `prefix` + name, so the two show up as `tenant-a:emails` and `tenant-b:emails`. Set each adapter's `prefix` to match the queue's own prefix so the labels line up.

There's also `BullBoardModule.forRootAsync()` which accepts `useFactory`, `imports`, `inject` for dynamic config.

You can inject the board instance anywhere:

```ts
import { Controller } from '@nestjs/common';
import { BullBoardInstance, InjectBullBoard } from '@bull-board/nestjs';

@Controller('ops')
export class OpsController {
  constructor(@InjectBullBoard() private readonly board: BullBoardInstance) {}
}
```

## Native Node platform

Nest 12.3+ within major 12 supports `@nestjs/platform-node`. Use Bull Board's native adapter with that platform. Existing Express and Fastify applications do not need the native platform package.

After the release containing `@bull-board/node` is published, install the matching packages:

```sh
npm install @bull-board/api @bull-board/nestjs @bull-board/node @nestjs/common@^12.3.0 @nestjs/core@^12.3.0 @nestjs/platform-node@^12.3.0 @nestjs/bullmq@^12 bullmq reflect-metadata rxjs
```

Before publication, use the [runnable example](https://github.com/felixmosh/bull-board/tree/master/examples/with-nestjs-node) with local built dependencies. Its README gives exact Redis, install, build, and start commands.

Use ESM with `"type": "module"` in `package.json`. The example's TypeScript settings include:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true,
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  }
}
```

Use `.js` extensions for local imports in TypeScript. Alias the two `NodeAdapter` classes so their roles are clear:

```ts
// main.ts
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { NodeAdapter as NestNodeAdapter } from '@nestjs/platform-node';
import { AppModule } from './app.module.js';

const app = await NestFactory.create(AppModule, new NestNodeAdapter());
app.enableShutdownHooks();
await app.listen(3000, '127.0.0.1');
```

```ts
// app.module.ts
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { BullBoardModule } from '@bull-board/nestjs';
import { NodeAdapter as BullBoardNodeAdapter } from '@bull-board/node';
import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { boardMiddleware } from './board.middleware.js';

@Module({
  imports: [
    BullModule.forRoot({ connection: { host: '127.0.0.1', port: 6379 } }),
    BullModule.registerQueue({ name: 'native-example' }),
    BullBoardModule.forRoot({
      route: '/queues',
      adapter: BullBoardNodeAdapter,
      middleware: boardMiddleware,
    }),
    BullBoardModule.forFeature({ name: 'native-example', adapter: BullMQAdapter }),
  ],
})
export class AppModule {}
```

`forRootAsync()` also accepts the native adapter through its factory's returned options.

### Authentication and Origin middleware

Use Node HTTP request and response APIs. The following middleware requires HTTP Basic authentication as `admin`, challenges browsers, and checks an explicit Origin against `BULL_BOARD_ORIGIN`:

```ts
// board.middleware.ts
import type { IncomingMessage, ServerResponse } from 'node:http';
const password = process.env.BULL_BOARD_PASSWORD;
if (!password) throw new Error('Set BULL_BOARD_PASSWORD before starting the example');
const expected = `Basic ${Buffer.from(`admin:${password}`).toString('base64')}`;
function deny(
  response: ServerResponse,
  status: number,
  body: string,
  headers?: Record<string, string>
): void {
  response.writeHead(status, headers);
  response.end(body);
}
export function boardMiddleware(
  request: IncomingMessage,
  response: ServerResponse,
  next: () => void
): void {
  if (request.headers.authorization !== expected) {
    deny(response, 401, 'Authentication required', {
      'WWW-Authenticate': 'Basic realm="Bull Board"',
    });
    return;
  }
  const origin = request.headers.origin;
  if (origin !== undefined && origin !== process.env.BULL_BOARD_ORIGIN) {
    deny(response, 403, 'Origin denied');
    return;
  }
  next();
}
```

Set `BULL_BOARD_PASSWORD` and `BULL_BOARD_ORIGIN=http://localhost:3000` before starting this example. Serve Basic authentication over HTTPS outside local development. Requests without Origin are allowed after authentication; Origin policy supplements authentication. The adapter does not add CORS headers.

Middleware runs before dashboard HTML, assets, polling, and queue mutations. To deny a request, end the response and return without `next()`.

### Paths, bodies, and completion

The module computes the public base path from `route` and the Nest global prefix. For example, `route: '/queues'` with `app.setGlobalPrefix('api')` serves `/api/queues`. To leave the board outside that prefix, exclude both its entry and subtree before listening:

```ts
import { RequestMethod } from '@nestjs/common';

app.setGlobalPrefix('api', {
  exclude: [
    { path: '/queues', method: RequestMethod.ALL },
    { path: '/queues/{*path}', method: RequestMethod.ALL },
  ],
});
```

Nest can strip mounted request URLs. The native adapter uses `originalUrl` when available and removes the calculated base path once. Middleware must not strip it again.

Nest parses JSON by default. Bull Board reuses a defined parsed body and does not read an ended or destroyed stream again. With `{ bodyParser: false }` in `NestFactory.create()`, the adapter reads JSON itself up to 100 KiB. Malformed JSON returns 400. Empty bodies remain acceptable for actions that do not need one.

The native handler returns `Promise<boolean>`. The Nest module calls downstream middleware only when it returns `false`. A handled response, including an empty 204, is complete. Unrelated application routes remain reachable. Keep `enableShutdownHooks()` so Nest closes its HTTP listener and DI-owned queue connections on shutdown.

## Plain adapter setup

If you'd rather wire the server adapter yourself (custom middleware, existing Nest conventions), do it in a module's `configure()`:

```ts
import { DynamicModule, MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { Queue } from 'bullmq';

@Module({})
export class QueuesModule implements NestModule {
  static register(): DynamicModule {
    return {
      module: QueuesModule,
      imports: [
        BullModule.forRoot({
          connection: { host: 'localhost', port: 6379 },
        }),
        BullModule.registerQueue({ name: 'test' }),
      ],
    };
  }

  constructor(private readonly testQueue: Queue) {}

  configure(consumer: MiddlewareConsumer) {
    const serverAdapter = new ExpressAdapter();
    serverAdapter.setBasePath('/queues');

    createBullBoard({
      queues: [new BullMQAdapter(this.testQueue)],
      serverAdapter,
    });

    consumer.apply(serverAdapter.getRouter()).forRoutes('/queues');
  }
}
```

## Full runnable examples

- Native Node platform with authentication and Origin policy: [`examples/with-nestjs-node`](https://github.com/felixmosh/bull-board/tree/master/examples/with-nestjs-node)
- NestJS module (recommended): [`examples/with-nestjs-module`](https://github.com/felixmosh/bull-board/tree/master/examples/with-nestjs-module)
- Plain adapter: [`examples/with-nestjs`](https://github.com/felixmosh/bull-board/tree/master/examples/with-nestjs)
- Fastify platform with auth: [`examples/with-nestjs-fastify-auth`](https://github.com/felixmosh/bull-board/tree/master/examples/with-nestjs-fastify-auth)

## Next steps

- [UIConfig](/configuration/ui-config): title, logo, locale, polling.
- [Read-only mode](/recipes/read-only-mode): disable destructive actions.
- [Visibility guard](/recipes/visibility-guard): scope visible queues per request.
- [Formatters](/recipes/formatters): rewrite job fields for the UI.
