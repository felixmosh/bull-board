import 'reflect-metadata';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter as BullBoardExpressAdapter } from '@bull-board/express';
import { uiFixtureBasePath } from '@bull-board/test-utils';
import { BullModule } from '@nestjs/bullmq';
import { INestApplication, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import { Queue } from 'bullmq';
import request from 'supertest';
import { BullBoardModule } from '../src';

const connection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: +(process.env.REDIS_PORT || 6379),
};

describe('forFeature with queue instances (same name, different prefix)', () => {
  const queues: Queue[] = [];
  let app: INestApplication | undefined;

  afterEach(async () => {
    if (app) {
      await app.close();
      app = undefined;
    }
    await Promise.all(queues.map((queue) => queue.close()));
    queues.length = 0;
  });

  it('registers both queues as distinct board entries', async () => {
    const emailsA = new Queue('emails', { connection, prefix: 'tenant-a' });
    const emailsB = new Queue('emails', { connection, prefix: 'tenant-b' });
    queues.push(emailsA, emailsB);

    @Module({
      imports: [
        BullBoardModule.forRoot({
          route: '/queues',
          adapter: BullBoardExpressAdapter,
          boardOptions: { uiBasePath: uiFixtureBasePath },
        }),
        BullBoardModule.forFeature(
          { queue: emailsA, adapter: BullMQAdapter, options: { prefix: 'tenant-a:' } },
          { queue: emailsB, adapter: BullMQAdapter, options: { prefix: 'tenant-b:' } }
        ),
      ],
    })
    class AppModule {}

    app = await NestFactory.create(AppModule, new ExpressAdapter(), { logger: false });
    await app.init();

    const res = await request(app.getHttpServer()).get('/queues/api/queues').expect(200);
    const names = (JSON.parse(res.text).queues as Array<{ name: string }>)
      .map((queue) => queue.name)
      .sort();

    expect(names).toEqual(['tenant-a:emails', 'tenant-b:emails']);
  });

  it('still resolves a queue from the DI container when only a name is given', async () => {
    @Module({
      imports: [
        BullModule.forRoot({ connection }),
        BullModule.registerQueue({ name: 'reports' }),
        BullBoardModule.forRoot({
          route: '/queues',
          adapter: BullBoardExpressAdapter,
          boardOptions: { uiBasePath: uiFixtureBasePath },
        }),
        BullBoardModule.forFeature({ name: 'reports', adapter: BullMQAdapter }),
      ],
    })
    class AppModule {}

    app = await NestFactory.create(AppModule, new ExpressAdapter(), { logger: false });
    await app.init();

    const res = await request(app.getHttpServer()).get('/queues/api/queues').expect(200);
    const names = (JSON.parse(res.text).queues as Array<{ name: string }>).map(
      (queue) => queue.name
    );

    expect(names).toEqual(['reports']);
  });
});
