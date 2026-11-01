import { createServer, IncomingMessage, request as httpRequest } from 'http';
import { createBullBoard } from '@bull-board/api';
import {
  ContractRequest,
  NormalizedResponse,
  runServerAdapterContract,
  uiFixtureBasePath,
} from '@bull-board/test-utils';
import { NodeAdapter } from '../src';

runServerAdapterContract('Node', async ({ basePath, queue }) => {
  const serverAdapter = new NodeAdapter().setBasePath(basePath);
  createBullBoard({
    queues: [queue.adapter],
    serverAdapter,
    options: { uiBasePath: uiFixtureBasePath },
  });

  const server = createServer((request, response) => {
    void serverAdapter
      .handle(request, response)
      .then((handled) => {
        if (!handled && !response.writableEnded) {
          response.statusCode = 404;
          response.end();
        }
      })
      .catch(() => response.destroy());
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected a TCP server address');
  const origin = `http://127.0.0.1:${address.port}`;

  const send = (req: ContractRequest): Promise<NormalizedResponse> =>
    new Promise((resolve, reject) => {
      const body = req.body === undefined ? undefined : JSON.stringify(req.body);
      const request = httpRequest(
        `${origin}${req.path}`,
        {
          method: req.method,
          headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
          timeout: 5000,
        },
        (response: IncomingMessage) => {
          const chunks: Buffer[] = [];
          response.on('data', (chunk: Buffer | string) => chunks.push(Buffer.from(chunk)));
          response.once('error', reject);
          response.on('end', () => {
            const headers = Object.fromEntries(
              Object.entries(response.headers).filter(
                (entry): entry is [string, string | string[]] => entry[1] !== undefined
              )
            );
            resolve({
              status: response.statusCode ?? 500,
              headers,
              text: Buffer.concat(chunks).toString('utf8'),
            });
          });
        }
      );
      request.once('timeout', () => request.destroy(new Error('Request timed out')));
      request.once('error', reject);
      if (body !== undefined) request.write(body);
      request.end();
    });

  return {
    request: send,
    teardown: async () => {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve()))
      );
    },
  };
});
