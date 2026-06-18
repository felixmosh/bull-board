import 'reflect-metadata';
import { ExpressAdapter as BullBoardExpressAdapter } from '@bull-board/express';
import {
  runServerAdapterContract,
  uiFixtureBasePath,
  NormalizedResponse,
  ContractRequest,
} from '@bull-board/test-utils';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import { json } from 'express';
import request from 'supertest';
import { BullBoardModule } from '../src';
import { BULL_BOARD_INSTANCE } from '../src/bull-board.constants';
import type { BullBoardInstance } from '../src/bull-board.types';

runServerAdapterContract('NestJS', async ({ basePath, queue }) => {
  const nestExpressAdapter = new ExpressAdapter();

  const route = basePath || '/';

  const appModule = BullBoardModule.forRoot({
    route,
    adapter: BullBoardExpressAdapter,
    boardOptions: { uiBasePath: uiFixtureBasePath },
    middleware: json(),
  });

  const app = await NestFactory.create(appModule, nestExpressAdapter, { logger: false });
  await app.init();

  const board = app.get<BullBoardInstance>(BULL_BOARD_INSTANCE);
  board.addQueue(queue.adapter);

  const send = async (req: ContractRequest): Promise<NormalizedResponse> => {
    const agent = request(app.getHttpServer());
    const m = req.method.toLowerCase() as 'get' | 'post' | 'put' | 'delete';
    let r = agent[m](req.path);
    if (req.body !== undefined) r = r.send(req.body as object);
    const res = await r;
    return { status: res.status, headers: res.headers as any, text: res.text };
  };

  return {
    request: send,
    teardown: async () => {
      await app.close();
    },
  };
});
