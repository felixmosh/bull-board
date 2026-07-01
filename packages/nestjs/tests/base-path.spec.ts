import 'reflect-metadata';
import { ExpressAdapter as BullBoardExpressAdapter } from '@bull-board/express';
import { uiFixtureBasePath } from '@bull-board/test-utils';
import { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import { json } from 'express';
import request from 'supertest';
import { BullBoardModule } from '../src';

async function bootBoard(options: { route: string; basePath?: string }): Promise<INestApplication> {
  const appModule = BullBoardModule.forRoot({
    route: options.route,
    basePath: options.basePath,
    adapter: BullBoardExpressAdapter,
    boardOptions: { uiBasePath: uiFixtureBasePath },
    middleware: json(),
  });

  const app = await NestFactory.create(appModule, new ExpressAdapter(), { logger: false });
  await app.init();
  return app;
}

describe('BullBoardModule basePath option', () => {
  it('injects options.basePath into the UI while still serving at the mount route', async () => {
    const app = await bootBoard({ route: '/queues', basePath: '/public/queues' });

    const entry = await request(app.getHttpServer()).get('/queues/');
    expect(entry.status).toBe(200);
    expect(entry.text).toContain('<base href="/public/queues/" />');

    // The route the app listens on is unchanged; assets are still served there.
    const asset = await request(app.getHttpServer()).get('/queues/static/test-asset.txt');
    expect(asset.status).toBe(200);

    await app.close();
  });

  it('normalizes a basePath that is missing a leading slash', async () => {
    const app = await bootBoard({ route: '/queues', basePath: 'public/queues' });

    const entry = await request(app.getHttpServer()).get('/queues/');
    expect(entry.text).toContain('<base href="/public/queues/" />');

    await app.close();
  });

  it('falls back to the mount route when basePath is not provided', async () => {
    const app = await bootBoard({ route: '/queues' });

    const entry = await request(app.getHttpServer()).get('/queues/');
    expect(entry.text).toContain('<base href="/queues/" />');

    await app.close();
  });
});
