/*
 * NOTE ON FASTIFY VERSION MATRIX
 *
 * The @bull-board/fastify adapter bundles @fastify/static@9 and @fastify/view@11 as runtime
 * dependencies. Both of these plugins target fastify@5; fastify-plugin enforces the host
 * fastify version at registration time. Registering this adapter under fastify@4 throws:
 *
 *   FastifyError: fastify-plugin: @fastify/view - expected '5.x' fastify version, '4.29.1' is installed
 *
 * This suite therefore covers fastify@5 only.
 *
 * The framework-major-version matrix pattern (caller-injected framework via describe.each) is
 * demonstrated on the Express adapter (Task 5) where no version-locked plugins are bundled.
 */

import { createBullBoard } from '@bull-board/api';
import {
  runServerAdapterContract,
  uiFixtureBasePath,
  NormalizedResponse,
  ContractRequest,
} from '@bull-board/test-utils';
import Fastify from 'fastify';
import { FastifyAdapter } from '../src';

runServerAdapterContract('Fastify', async ({ basePath, queue }) => {
  const serverAdapter = new FastifyAdapter();
  serverAdapter.setBasePath(basePath);
  createBullBoard({
    queues: [queue.adapter],
    serverAdapter,
    options: { uiBasePath: uiFixtureBasePath },
  });

  const app = Fastify();
  await app.register(serverAdapter.registerPlugin(), { prefix: basePath || undefined });
  await app.ready();

  const send = async (req: ContractRequest): Promise<NormalizedResponse> => {
    const res = await app.inject({
      method: req.method.toUpperCase() as any,
      url: req.path,
      payload: req.body as any,
    });
    return { status: res.statusCode, headers: res.headers as any, text: res.body };
  };

  return {
    request: send,
    teardown: async () => {
      await app.close();
    },
  };
});
