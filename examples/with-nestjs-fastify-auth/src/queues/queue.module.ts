/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { FastifyAdapter } from '@bull-board/fastify';
import { BullModule } from '@nestjs/bullmq';
import { DynamicModule, Module, NestModule } from '@nestjs/common';
import { Queue } from 'bullmq';

import { ConfigModule } from '@nestjs/config';
import {
  InjectTestQueue,
  TEST_QUEUE_NAME,
  TestProcessor,
} from './test.processor';
import { HttpAdapterHost } from '@nestjs/core';
import { FastifyInstance } from 'fastify';
import fastifyCookie from '@fastify/cookie';
import secureSession from '@fastify/secure-session';

@Module({
  imports: [ConfigModule],
})
export class QueueModule implements NestModule {
  static register(): DynamicModule {
    const testQueue = BullModule.registerQueue({
      name: TEST_QUEUE_NAME,
    });

    if (!testQueue.providers || !testQueue.exports) {
      throw new Error('Unable to build queue');
    }

    return {
      module: QueueModule,
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

  constructor(
    private readonly adapterHost: HttpAdapterHost,
    @InjectTestQueue() private readonly testQueue: Queue,
  ) {}

  configure() {
    const BULLBOARD_PAGE_PATH = '/queues';
    const serverAdapter = new FastifyAdapter();
    serverAdapter.setBasePath(BULLBOARD_PAGE_PATH);

    createBullBoard({
      queues: [new BullMQAdapter(this.testQueue)],
      serverAdapter,
    });

    const fastify: FastifyInstance = this.adapterHost.httpAdapter.getInstance();

    fastify.register(fastifyCookie);

    (fastify as any).register(secureSession, {
      secret: process.env.BULLBOARD_SESSION_SECRET,
      cookieName: 'session-cookie',
      cookie: {
        path: '/',
        maxAge: 604800, // 7 days
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
      },
    });

    // Apply preHandler middleware only to the prefix routes
    fastify.register(
      (instance) => {
        instance.addHook('preHandler', (req, res, next) => {
          if (!req.session.get('sev-data')) {
            return res.redirect('/login');
          }
          next();
        });
        instance.register(serverAdapter.registerPlugin());
      },
      { prefix: BULLBOARD_PAGE_PATH },
    );
  }
}
