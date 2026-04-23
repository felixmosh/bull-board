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

`forFeature()` options:

- `name`: queue name registered with `BullModule.registerQueue`.
- `adapter`: `BullMQAdapter` or `BullAdapter`.
- `options`: queue adapter options like `readOnlyMode` or `description`.

To register several queues at once, pass multiple option objects:

```ts
BullBoardModule.forFeature(
  { name: 'emails', adapter: BullMQAdapter },
  { name: 'billing', adapter: BullMQAdapter },
);
```

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
