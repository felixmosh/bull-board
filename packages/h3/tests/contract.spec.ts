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

type WebApp = { fetch: (request: Request) => Promise<Response> };

const hasFetch = (app: unknown): app is WebApp => typeof (app as WebApp).fetch === 'function';

runServerAdapterContract('H3', async ({ basePath, queue }) => {
  const serverAdapter = new H3Adapter();
  serverAdapter.setBasePath(basePath);
  createBullBoard({
    queues: [queue.adapter],
    serverAdapter,
    options: { uiBasePath: uiFixtureBasePath },
  });

  const app = createApp();
  app.use(serverAdapter.registerHandlers());

  // h3@2 apps are web-standard and expose `fetch`. Driving that directly rather than
  // going through `toNodeListener` keeps the suite off h3's node response layer, which
  // rejects a promise created in jest's VM realm (`res instanceof Promise` in srvx).
  const sendWeb = async (req: ContractRequest): Promise<NormalizedResponse> => {
    const hasBody = req.body !== undefined;
    const res = await (app as unknown as WebApp).fetch(
      new Request(`http://localhost${req.path}`, {
        method: req.method.toUpperCase(),
        headers: hasBody ? { 'content-type': 'application/json' } : undefined,
        body: hasBody ? JSON.stringify(req.body) : undefined,
      })
    );

    const headers: Record<string, string | string[]> = {};
    res.headers.forEach((value, key) => {
      headers[key] = value;
    });

    return { status: res.status, headers, text: await res.text() };
  };

  const sendNode = async (req: ContractRequest): Promise<NormalizedResponse> => {
    const agent = request(toNodeListener(app));
    const m = req.method.toLowerCase() as 'get' | 'post' | 'put' | 'delete';
    let r = agent[m](req.path);
    if (req.body !== undefined) r = r.send(req.body as object);
    const res = await r;
    return { status: res.status, headers: res.headers as any, text: res.text };
  };

  return {
    request: hasFetch(app) ? sendWeb : sendNode,
    teardown: async () => undefined,
  };
});
