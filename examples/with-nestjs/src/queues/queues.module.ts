import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { BullModule } from '@nestjs/bullmq';
import {
  DynamicModule,
  MiddlewareConsumer,
  Module,
  NestModule,
} from '@nestjs/common';
import { Queue } from 'bullmq';

import { ConfigModule } from '@nestjs/config';
import { BasicAuthMiddleware } from './basic-auth.middleware';
import {
  InjectTestQueue,
  TEST_QUEUE_NAME,
  TestProcessor,
} from './test.processor';

@Module({
  imports: [ConfigModule],
})
export class QueuesModule implements NestModule {
  static register(): DynamicModule {
    const testQueue = BullModule.registerQueue({
      name: TEST_QUEUE_NAME,
    });

    if (!testQueue.providers || !testQueue.exports) {
      throw new Error('Unable to build queue');
    }

    return {
      module: QueuesModule,
      imports: [
        BullModule.forRoot({
          connection: {
            host: 'localhost',
            port: 15610,
          },
          defaultJobOptions: {
            attempts: 3,
            backoff: {
              type: 'exponential',
              delay: 1000,
            },
          },
        }),
        testQueue,
      ],
      providers: [TestProcessor, ...testQueue.providers],
      exports: [...testQueue.exports],
    };
  }

  constructor(@InjectTestQueue() private readonly testQueue: Queue) {}

  configure(consumer: MiddlewareConsumer) {
    const serverAdapter = new ExpressAdapter();
    serverAdapter.setBasePath('/queues');

    createBullBoard({
      queues: [new BullMQAdapter(this.testQueue)],
      serverAdapter,
    });

    consumer
      .apply(BasicAuthMiddleware, serverAdapter.getRouter())
      .forRoutes('/queues');
  }
}
