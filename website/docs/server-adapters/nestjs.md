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
- `adapter`: server adapter class (`ExpressAdapter` or `FastifyAdapter`).
- `boardOptions`: forwarded to `createBullBoard` (e.g. `uiConfig`, `uiBasePath`).
- `middleware`: optional Express/Fastify middleware (basic auth, etc.).

`forFeature()` options (pass either `name` or `queue`):

- `name`: queue name registered with `BullModule.registerQueue`. The module resolves the instance from Nest's DI container.
- `queue`: a queue instance to register directly, instead of resolving it by `name`. See [Queues with the same name](#queues-with-the-same-name) below.
- `adapter`: `BullMQAdapter` or `BullAdapter`.
- `options`: queue adapter options like `readOnlyMode` or `description`.

To register several queues at once, pass multiple option objects:

```ts
BullBoardModule.forFeature(
  { name: 'emails', adapter: BullMQAdapter },
  { name: 'billing', adapter: BullMQAdapter },
);
```

### Queues with the same name

`@nestjs/bullmq` builds a queue's DI token from its `name` alone — the `prefix` is not part of it. So if you run the same queue name under two prefixes (a common multi-tenant setup), both share one DI token and a `name` lookup can only ever return one of them. Registering both by `name` makes one queue shadow the other on the board.

Pass the instances directly via `queue` instead. Hold the queues somewhere you control — a provider, a service, wherever you created them — and hand them to `forFeature`:

```ts
@Module({
  imports: [
    BullBoardModule.forFeature(
      { queue: emailsTenantA, adapter: BullMQAdapter, options: { prefix: 'tenant-a:' } },
      { queue: emailsTenantB, adapter: BullMQAdapter, options: { prefix: 'tenant-b:' } },
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

## Plain adapter setup

If you'd rather wire the server adapter yourself (custom middleware, existing Nest conventions), do it in a module's `configure()`:

```ts
import {
  DynamicModule,
  MiddlewareConsumer,
  Module,
  NestModule,
} from '@nestjs/common';
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

- NestJS module (recommended): [`examples/with-nestjs-module`](https://github.com/felixmosh/bull-board/tree/master/examples/with-nestjs-module)
- Plain adapter: [`examples/with-nestjs`](https://github.com/felixmosh/bull-board/tree/master/examples/with-nestjs)
- Fastify platform with auth: [`examples/with-nestjs-fastify-auth`](https://github.com/felixmosh/bull-board/tree/master/examples/with-nestjs-fastify-auth)

## Next steps

- [UIConfig](/configuration/ui-config): title, logo, locale, polling.
- [Read-only mode](/recipes/read-only-mode): disable destructive actions.
- [Visibility guard](/recipes/visibility-guard): scope visible queues per request.
- [Formatters](/recipes/formatters): rewrite job fields for the UI.
