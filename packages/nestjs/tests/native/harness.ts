import 'reflect-metadata';
import { request as httpRequest } from 'node:http';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import type { BoardOptions } from '@bull-board/api/typings/app';
import { NodeAdapter as BullBoardNodeAdapter } from '@bull-board/node';
import { connection, uiFixtureBasePath } from '@bull-board/test-utils';
import type {
  ContractRequest,
  Harness,
  NormalizedResponse,
  SeededQueue,
} from '@bull-board/test-utils';
import { BullModule, getQueueToken } from '@nestjs/bullmq';
import { All, Controller, Get, Module, RequestMethod } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NodeAdapter as NestNodeAdapter } from '@nestjs/platform-node';
import type { Queue } from 'bullmq';
import { BullBoardModule } from '../../src';

type NativeMiddleware = (
  request: IncomingMessage,
  response: ServerResponse,
  next: () => void
) => void;

type NativeHarnessOptions = {
  basePath: string;
  queue: Pick<SeededQueue, 'name'>;
  configuration?: 'sync' | 'async';
  middleware?: NativeMiddleware;
  globalPrefix?: { prefix: string; board: 'included' | 'excluded' };
  bodyParser?: boolean;
  boardOptions?: BoardOptions;
};

type NativeRequest = ContractRequest & { headers?: Record<string, string> };
type RawRequest = Omit<NativeRequest, 'body'> & { payload: string };

export interface NativeHarness extends Harness {
  request: (request: NativeRequest) => Promise<NormalizedResponse>;
  requestRaw: (request: RawRequest) => Promise<NormalizedResponse>;
  server: Server;
  queue: Queue;
  observations: { downstream: number };
}

export async function createNativeHarness({
  basePath,
  queue,
  configuration = 'sync',
  middleware,
  globalPrefix,
  bodyParser = true,
  boardOptions,
}: NativeHarnessOptions): Promise<NativeHarness> {
  const observations = { downstream: 0 };

  @Controller()
  class AppController {
    @Get('/health')
    health() {
      return { application: true };
    }

    @All([
      `${basePath}/api/queues`,
      `${basePath}/api/queues/:queueName/add`,
      `${basePath}/api/queues/:queueName/pause`,
    ])
    overlappingBoardRoute() {
      observations.downstream += 1;
      return { downstream: observations.downstream };
    }

    @Get(`${basePath}/downstream`)
    downstream() {
      observations.downstream += 1;
      return { downstream: observations.downstream };
    }
  }

  const options = {
    route: basePath || '/',
    adapter: BullBoardNodeAdapter,
    boardOptions: { uiBasePath: uiFixtureBasePath, ...boardOptions },
    middleware,
  };

  @Module({
    controllers: [AppController],
    imports: [
      BullModule.forRoot({ connection }),
      BullModule.registerQueue({ name: queue.name }),
      configuration === 'async'
        ? BullBoardModule.forRootAsync({ useFactory: async () => options })
        : BullBoardModule.forRoot(options),
      BullBoardModule.forFeature({ name: queue.name, adapter: BullMQAdapter }),
    ],
  })
  class NativeAppModule {}

  const app = await NestFactory.create(NativeAppModule, new NestNodeAdapter(), {
    logger: false,
    abortOnError: false,
    bodyParser,
  });
  try {
    if (globalPrefix) {
      app.setGlobalPrefix(
        globalPrefix.prefix,
        globalPrefix.board === 'excluded'
          ? {
              exclude: [
                { path: basePath || '/', method: RequestMethod.ALL },
                { path: `${basePath}/{*path}`, method: RequestMethod.ALL },
              ],
            }
          : undefined
      );
    }
    await app.listen(0, '127.0.0.1');
    const server = app.getHttpServer<Server>();
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Nest native app did not bind an ephemeral TCP port');
    }
    const port = address.port;

    const send = (
      req: Omit<NativeRequest, 'body'>,
      payload: string | undefined
    ): Promise<NormalizedResponse> =>
      new Promise((resolve, reject) => {
        const request = httpRequest(
          {
            host: '127.0.0.1',
            port,
            method: req.method,
            path: req.path,
            headers: {
              ...(payload === undefined
                ? {}
                : {
                    'content-type': 'application/json',
                    'content-length': Buffer.byteLength(payload),
                  }),
              ...req.headers,
            },
            timeout: 5000,
            agent: false,
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
        request.end(payload);
      });

    return {
      request: (req) => send(req, req.body === undefined ? undefined : JSON.stringify(req.body)),
      requestRaw: (req) => send(req, req.payload),
      teardown: () => app.close(),
      server,
      queue: app.get<Queue>(getQueueToken(queue.name)),
      observations,
    };
  } catch (error) {
    await app.close();
    throw error;
  }
}
