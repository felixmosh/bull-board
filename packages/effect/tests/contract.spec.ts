import { createBullBoard } from '@bull-board/api';
import {
  runServerAdapterContract,
  uiFixtureBasePath,
  NormalizedResponse,
  ContractRequest,
} from '@bull-board/test-utils';
import * as NodeHttpServer from '@effect/platform-node/NodeHttpServer';
import { Layer } from 'effect';
import { HttpRouter } from 'effect/http';
import { EffectAdapter } from '../src';

runServerAdapterContract('Effect', async ({ basePath, queue }) => {
  const serverAdapter = new EffectAdapter();
  serverAdapter.setBasePath(basePath);
  createBullBoard({
    queues: [queue.adapter],
    serverAdapter,
    options: { uiBasePath: uiFixtureBasePath },
  });

  const { handler, dispose } = HttpRouter.toWebHandler(
    serverAdapter.registerPlugin().pipe(Layer.provide(NodeHttpServer.layerHttpServices)),
    { disableLogger: true }
  );

  const send = async (req: ContractRequest): Promise<NormalizedResponse> => {
    const res = await handler(
      new Request(`http://localhost${req.path}`, {
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

  return { request: send, teardown: dispose };
});
