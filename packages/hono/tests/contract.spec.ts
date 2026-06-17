import { Hono } from 'hono';
import { serveStatic } from '@hono/node-server/serve-static';
import { createBullBoard } from '@bull-board/api';
import {
  runServerAdapterContract,
  uiFixtureBasePath,
  NormalizedResponse,
  ContractRequest,
} from '@bull-board/test-utils';
import { HonoAdapter } from '../src';

runServerAdapterContract('Hono', async ({ basePath, queue }) => {
  const serverAdapter = new HonoAdapter(serveStatic);
  serverAdapter.setBasePath(basePath || '/');
  createBullBoard({
    queues: [queue.adapter],
    serverAdapter,
    options: { uiBasePath: uiFixtureBasePath },
  });

  const plugin = serverAdapter.registerPlugin();
  const root = new Hono();
  if (basePath) {
    root.route(basePath, plugin);
    root.route(basePath + '/', plugin);
  } else {
    root.route('/', plugin);
  }

  const send = async (req: ContractRequest): Promise<NormalizedResponse> => {
    const res = await root.request(req.path, {
      method: req.method.toUpperCase(),
      ...(req.body !== undefined
        ? { body: JSON.stringify(req.body), headers: { 'content-type': 'application/json' } }
        : {}),
    });
    const headers: Record<string, string> = {};
    res.headers.forEach((v, k) => (headers[k] = v));
    return { status: res.status, headers, text: await res.text() };
  };

  return { request: send, teardown: async () => undefined };
});
