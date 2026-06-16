import { createBullBoard } from '@bull-board/api';
import {
  runServerAdapterContract,
  uiFixtureBasePath,
  NormalizedResponse,
  ContractRequest,
} from '@bull-board/test-utils';
import { BunAdapter } from '../src';

runServerAdapterContract('Bun', async ({ basePath, queue }) => {
  const serverAdapter = new BunAdapter();
  serverAdapter.setBasePath(basePath || '/');
  createBullBoard({
    queues: [queue.adapter],
    serverAdapter,
    options: { uiBasePath: uiFixtureBasePath },
  });

  const routes = serverAdapter.registerPlugin();
  const server = Bun.serve({
    port: 0,
    routes,
    fetch() {
      return new Response('Not Found', { status: 404 });
    },
  });

  const request = async (req: ContractRequest): Promise<NormalizedResponse> => {
    const base = server.url.toString().replace(/\/$/, '');
    const url = base + req.path;
    const res = await fetch(url, {
      method: req.method.toUpperCase(),
      ...(req.body !== undefined
        ? {
            body: JSON.stringify(req.body),
            headers: { 'Content-Type': 'application/json' },
          }
        : {}),
    });
    const headers: Record<string, string> = {};
    res.headers.forEach((v, k) => {
      headers[k] = v;
    });
    return { status: res.status, headers, text: await res.text() };
  };

  return {
    request,
    teardown: async () => server.stop(true),
  };
});
