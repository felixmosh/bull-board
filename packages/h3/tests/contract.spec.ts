import { createBullBoard } from '@bull-board/api';
import {
  runServerAdapterContract,
  uiFixtureBasePath,
  NormalizedResponse,
  ContractRequest,
} from '@bull-board/test-utils';
import { createApp, toNodeListener } from 'h3';
import request from 'supertest';
import { H3Adapter } from '../src';

runServerAdapterContract('H3', async ({ basePath, queue }) => {
  const serverAdapter = new H3Adapter();
  serverAdapter.setBasePath(basePath);
  createBullBoard({
    queues: [queue.adapter],
    serverAdapter,
    options: { uiBasePath: uiFixtureBasePath },
  });

  const router = serverAdapter.registerHandlers();
  const app = createApp();
  app.use(router);
  const listener = toNodeListener(app);

  const send = async (req: ContractRequest): Promise<NormalizedResponse> => {
    const agent = request(listener);
    const m = req.method.toLowerCase() as 'get' | 'post' | 'put' | 'delete';
    let r = agent[m](req.path);
    if (req.body !== undefined) r = r.send(req.body as object);
    const res = await r;
    return { status: res.status, headers: res.headers as any, text: res.text };
  };

  return { request: send, teardown: async () => undefined };
});
