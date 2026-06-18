import { createBullBoard } from '@bull-board/api';
import {
  runServerAdapterContract,
  uiFixtureBasePath,
  NormalizedResponse,
  ContractRequest,
} from '@bull-board/test-utils';
import express from 'express';
import request from 'supertest';
import { ExpressAdapter } from '../src';

runServerAdapterContract('Express', async ({ basePath, queue }) => {
  const serverAdapter = new ExpressAdapter();
  serverAdapter.setBasePath(basePath);
  createBullBoard({
    queues: [queue.adapter],
    serverAdapter,
    options: { uiBasePath: uiFixtureBasePath },
  });

  const app = express();
  app.use(basePath || '/', serverAdapter.getRouter());

  const send = async (req: ContractRequest): Promise<NormalizedResponse> => {
    const agent = request(app);
    const m = req.method.toLowerCase() as 'get' | 'post' | 'put' | 'delete';
    let r = agent[m](req.path);
    if (req.body !== undefined) r = r.send(req.body as object);
    const res = await r;
    return { status: res.status, headers: res.headers as any, text: res.text };
  };

  return { request: send, teardown: async () => undefined };
});
