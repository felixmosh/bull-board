import 'reflect-metadata';
import { request as httpRequest } from 'node:http';
import type { IncomingMessage, Server } from 'node:http';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { NodeAdapter as BullBoardNodeAdapter } from '@bull-board/node';
import { connection, uiFixtureBasePath } from '@bull-board/test-utils';
import type {
  ContractRequest,
  Harness,
  NormalizedResponse,
  SeededQueue,
} from '@bull-board/test-utils';
import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NodeAdapter as NestNodeAdapter } from '@nestjs/platform-node';
import { BullBoardModule } from '../../src';

export async function createNativeHarness({
  basePath,
  queue,
}: {
  basePath: string;
  queue: Pick<SeededQueue, 'name'>;
}): Promise<Harness> {
  @Module({
    imports: [
      BullModule.forRoot({ connection }),
      BullModule.registerQueue({ name: queue.name }),
      BullBoardModule.forRoot({
        route: basePath || '/',
        adapter: BullBoardNodeAdapter,
        boardOptions: { uiBasePath: uiFixtureBasePath },
      }),
      BullBoardModule.forFeature({ name: queue.name, adapter: BullMQAdapter }),
    ],
  })
  class NativeAppModule {}

  const app = await NestFactory.create(NativeAppModule, new NestNodeAdapter(), {
    logger: false,
    abortOnError: false,
  });
  try {
    await app.listen(0, '127.0.0.1');
    const server = app.getHttpServer<Server>();
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Nest native app did not bind an ephemeral TCP port');
    }
    const port = address.port;

    const send = (req: ContractRequest): Promise<NormalizedResponse> =>
      new Promise((resolve, reject) => {
        const payload = req.body === undefined ? undefined : JSON.stringify(req.body);
        const request = httpRequest(
          {
            host: '127.0.0.1',
            port,
            method: req.method,
            path: req.path,
            headers: payload === undefined ? undefined : { 'content-type': 'application/json' },
            timeout: 5000,
          },
          (response: IncomingMessage) => {
            const chunks: Buffer[] = [];
            response.on('data', (chunk: Buffer | string) => {
              chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
            });
            response.on('error', reject);
            response.on('end', () => {
              const headers: Record<string, string | string[]> = {};
              for (const [name, value] of Object.entries(response.headers)) {
                if (value !== undefined) headers[name] = value;
              }
              resolve({
                status: response.statusCode ?? 0,
                headers,
                text: Buffer.concat(chunks).toString('utf8'),
              });
            });
          }
        );
        request.on('timeout', () => request.destroy(new Error('HTTP request timed out')));
        request.on('error', reject);
        if (payload !== undefined) request.write(payload);
        request.end();
      });

    return { request: send, teardown: () => app.close() };
  } catch (error) {
    await app.close();
    throw error;
  }
}
