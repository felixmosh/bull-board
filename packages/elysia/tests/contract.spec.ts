import { createBullBoard } from '@bull-board/api';
import {
  runServerAdapterContract,
  uiFixtureBasePath,
  NormalizedResponse,
  ContractRequest,
} from '@bull-board/test-utils';
import { Elysia } from 'elysia';
import { ElysiaAdapter } from '../src';

runServerAdapterContract('Elysia', async ({ basePath, queue }) => {
  const serverAdapter = new ElysiaAdapter({ prefix: basePath || '', basePath: basePath || '/' });
  createBullBoard({
    queues: [queue.adapter],
    serverAdapter,
    options: { uiBasePath: uiFixtureBasePath },
  });

  const plugin = await serverAdapter.registerPlugin();
  const app = new Elysia().use(plugin);

  const send = async (req: ContractRequest): Promise<NormalizedResponse> => {
    const res = await app.handle(
      new Request('http://localhost' + req.path, {
        method: req.method.toUpperCase(),
        ...(req.body !== undefined
          ? { body: JSON.stringify(req.body), headers: { 'content-type': 'application/json' } }
          : {}),
      })
    );
    const headers: Record<string, string> = {};
    res.headers.forEach((v, k) => (headers[k] = v));
    return { status: res.status, headers, text: await res.text() };
  };

  return { request: send, teardown: async () => undefined };
});
