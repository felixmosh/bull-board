import Koa from 'koa';
import request from 'supertest';
import { createBullBoard } from '@bull-board/api';
import {
  runServerAdapterContract,
  uiFixtureBasePath,
  NormalizedResponse,
  ContractRequest,
} from '@bull-board/test-utils';
import { KoaAdapter } from '../src';

runServerAdapterContract('Koa', async ({ basePath, queue }) => {
  const serverAdapter = new KoaAdapter();
  serverAdapter.setBasePath(basePath);
  createBullBoard({
    queues: [queue.adapter],
    serverAdapter,
    options: { uiBasePath: uiFixtureBasePath },
  });

  const app = new Koa();
  app.use(serverAdapter.registerPlugin({ mount: basePath || '/' }));

  const send = async (req: ContractRequest): Promise<NormalizedResponse> => {
    const agent = request(app.callback());
    const m = req.method.toLowerCase() as 'get' | 'post' | 'put' | 'delete';
    let r = agent[m](req.path);
    if (req.body !== undefined) r = r.send(req.body as object);
    const res = await r;
    return { status: res.status, headers: res.headers as any, text: res.text };
  };

  return { request: send, teardown: async () => undefined };
});
