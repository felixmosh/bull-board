import { IncomingMessage, ServerResponse, createServer, request as httpRequest } from 'http';
import { createBullBoard } from '@bull-board/api';
import type { AppControllerRoute } from '@bull-board/api/typings/app';
import { seedQueue, uiFixtureBasePath } from '@bull-board/test-utils';
import { NodeAdapter } from '../src/NodeAdapter';

type ProbeRoute = AppControllerRoute<'EmptyResponse', unknown, unknown>;
type Options = {
  method?: string;
  body?: string;
  headers?: Record<string, string>;
  chunked?: boolean;
  abort?: boolean;
};
type Reply = { status: number; headers: IncomingMessage['headers']; text: string };
type Client = (path: string, options?: Options) => Promise<Reply>;

const echo: ProbeRoute = {
  method: ['get', 'post', 'put', 'patch'],
  route: ['/api/echo/:name', '/api/alias/:name'],
  spec: { summary: 'Transport probe', response: 'EmptyResponse' },
  handler: (request) => ({
    body: {
      params: request?.params,
      query: request?.query,
      body: request?.body ?? null,
      bodyType: typeof request?.body,
      headers: request?.headers,
      title: request?.uiConfig.boardTitle,
    },
  }),
};

function adapter(routes: ProbeRoute[] = [echo]): NodeAdapter {
  return new NodeAdapter().setUIConfig({ boardTitle: 'Transport' }).setApiRoutes(routes);
}

async function withServer(
  board: NodeAdapter,
  run: (client: Client) => Promise<void>,
  prepare?: (request: IncomingMessage, response: ServerResponse) => Promise<void> | void
): Promise<void> {
  const pending = new Set<Promise<void>>();
  const errors: unknown[] = [];
  const server = createServer((request, response) => {
    const handling = (async () => {
      await prepare?.(request, response);
      const flowing = request.readableFlowing;
      const handled = await board.handle(request, response);
      if (!handled) {
        expect(request.readableFlowing).toBe(flowing);
        expect(response.headersSent).toBe(false);
        const chunks: Buffer[] = [];
        for await (const chunk of request) chunks.push(Buffer.from(chunk));
        response.end(`outside:${Buffer.concat(chunks).toString()}`);
      }
    })()
      .catch((error: unknown) => {
        errors.push(error);
        response.destroy();
      })
      .finally(() => pending.delete(handling));
    pending.add(handling);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected a TCP address');
  const client: Client = (path, options = {}) =>
    new Promise((resolve, reject) => {
      const headers = { ...options.headers };
      if (options.body !== undefined) {
        headers['content-type'] ??= 'application/json';
        if (!options.chunked) headers['content-length'] = String(Buffer.byteLength(options.body));
      }
      const request = httpRequest(
        { host: '127.0.0.1', port: address.port, path, method: options.method ?? 'GET', headers },
        (response) => {
          const chunks: Buffer[] = [];
          response.on('data', (chunk: Buffer) => chunks.push(chunk));
          response.on('end', () =>
            resolve({
              status: response.statusCode ?? 0,
              headers: response.headers,
              text: Buffer.concat(chunks).toString(),
            })
          );
          response.on('error', reject);
        }
      );
      request.setTimeout(3000, () => request.destroy(new Error(`Timeout: ${path}`)));
      request.on('error', reject);
      if (options.abort) {
        request.once('continue', () => {
          request.write('{');
          request.destroy(new Error('client aborted'));
        });
        request.flushHeaders();
      } else request.end(options.body);
    });
  try {
    await run(client);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    );
    await Promise.all(pending);
    expect(errors).toEqual([]);
  }
}

describe('native API transport', () => {
  it('dispatches every configured method and path, decoding parameters once', async () => {
    await withServer(adapter(), async (request) => {
      for (const method of ['GET', 'POST', 'PUT', 'PATCH']) {
        for (const route of ['echo', 'alias']) {
          const result = await request(`/api/${route}/hello%252Fworld/`, { method });
          expect(result.status).toBe(200);
          expect(result.headers['content-type']).toMatch(/^application\/json/);
          expect(JSON.parse(result.text)).toMatchObject({
            params: { name: 'hello%2Fworld' },
            title: 'Transport',
          });
        }
      }
    });
  });

  it('preserves query arrays, question marks, and own keys without inherited values', async () => {
    await withServer(adapter(), async (request) => {
      const result = await request(
        '/api/echo/q?tag=one&tag=two&text=a?b&__proto__=safe&toString=value'
      );
      expect(result.status).toBe(200);
      expect(JSON.parse(result.text).query).toEqual(
        JSON.parse('{"tag":["one","two"],"text":"a?b","__proto__":"safe","toString":"value"}')
      );
    });
  });

  it('passes original headers and joins array-valued headers', async () => {
    await withServer(
      adapter(),
      async (request) => {
        const result = await request('/api/echo/q', {
          headers: { origin: 'https://allowed.example' },
        });
        expect(JSON.parse(result.text).headers).toMatchObject({
          origin: 'https://allowed.example',
          'x-probe': 'one, two',
          cookie: 'one=1; two=2',
        });
      },
      (request) => {
        request.headers['x-probe'] = ['one', 'two'];
        Object.defineProperty(request.headers, 'cookie', {
          value: ['one=1', 'two=2'],
          enumerable: true,
        });
      }
    );
  });

  it.each(['{"value":7}', '[1,2]', 'false', 'null', '"text"'])(
    'passes parsed JSON %s to the handler',
    async (body) => {
      await withServer(adapter(), async (request) => {
        const result = await request('/api/echo/q', { method: 'POST', body });
        expect(result.status).toBe(200);
        expect(JSON.parse(result.text).body).toEqual(JSON.parse(body));
        expect(JSON.parse(result.text).bodyType).toBe(typeof JSON.parse(body));
      });
    }
  );

  it('finishes an empty request without inventing body data', async () => {
    await withServer(adapter(), async (request) => {
      const result = await request('/api/echo/q', { method: 'POST', body: '' });
      expect(result.status).toBe(200);
      expect(JSON.parse(result.text)).toMatchObject({ body: null, bodyType: 'undefined' });
    });
  });

  it('uses an upstream parsed body without reading the raw payload again', async () => {
    await withServer(
      adapter(),
      async (request) => {
        const result = await request('/api/echo/q', { method: 'POST', body: '{bad JSON' });
        expect(result.status).toBe(200);
        expect(JSON.parse(result.text).body).toEqual({ parsed: true });
      },
      (request) => {
        Object.defineProperty(request, 'body', { value: { parsed: true } });
      }
    );
  });

  it('does not wait on an already consumed body stream', async () => {
    await withServer(
      adapter(),
      async (request) => {
        const result = await request('/api/echo/q', { method: 'POST', body: '{"value":7}' });
        expect(result.status).toBe(200);
        expect(JSON.parse(result.text)).toMatchObject({ body: null, bodyType: 'undefined' });
      },
      async (request) => {
        for await (const chunk of request) void chunk;
      }
    );
  });

  it('reads a complete but unread stream when the body property is undefined', async () => {
    await withServer(
      adapter(),
      async (request) => {
        const result = await request('/api/echo/q', { method: 'POST', body: '{"value":7}' });
        expect(result.status).toBe(200);
        expect(JSON.parse(result.text).body).toEqual({ value: 7 });
      },
      async (request) => {
        Object.defineProperty(request, 'body', { value: undefined });
        await new Promise((resolve) => setTimeout(resolve, 20));
        expect(request.complete).toBe(true);
        expect(request.readableEnded).toBe(false);
      }
    );
  });

  it('returns a translated 400 for malformed JSON and serves the next request', async () => {
    await withServer(adapter(), async (request) => {
      const result = await request('/api/echo/q', { method: 'POST', body: '{bad' });
      expect(result.status).toBe(400);
      expect(JSON.parse(result.text)).toEqual({ error: { key: 'ERRORS.INVALID_REQUEST_BODY' } });
      expect((await request('/api/echo/q')).status).toBe(200);
    });
  });

  it.each([false, true])('returns a finite 413 for excessive JSON, chunked=%s', async (chunked) => {
    await withServer(adapter(), async (request) => {
      const result = await request('/api/echo/q', {
        method: 'POST',
        chunked,
        body: JSON.stringify({ payload: 'x'.repeat(101 * 1024) }),
      });
      expect(result.status).toBe(413);
      expect(JSON.parse(result.text)).toEqual({ error: { key: 'ERRORS.INVALID_REQUEST_BODY' } });
      expect((await request('/api/echo/q')).status).toBe(200);
    });
  });

  it('accepts exactly 100 KiB and measures excessive UTF-8 bodies in bytes', async () => {
    await withServer(adapter(), async (request) => {
      const body = JSON.stringify({ payload: 'x'.repeat(102386) });
      expect(Buffer.byteLength(body)).toBe(102400);
      const accepted = await request('/api/echo/q', { method: 'POST', body });
      expect(accepted.status).toBe(200);
      expect(JSON.parse(accepted.text).body.payload.length).toBe(102386);
      const rejected = await request('/api/echo/q', {
        method: 'POST',
        body: JSON.stringify({ payload: '🎈'.repeat(26 * 1024) }),
      });
      expect(rejected.status).toBe(413);
      expect(JSON.parse(rejected.text)).toEqual({ error: { key: 'ERRORS.INVALID_REQUEST_BODY' } });
    });
  });

  it('preserves configured route order and translates malformed parameter encoding', async () => {
    const named: ProbeRoute = {
      ...echo,
      route: '/api/echo/fixed',
      handler: () => ({ body: { fixed: true } }),
    };
    await withServer(adapter([named, echo]), async (request) => {
      expect(JSON.parse((await request('/api/echo/fixed')).text)).toEqual({ fixed: true });
      const bad = await request('/api/echo/%ZZ');
      expect(bad.status).toBe(400);
      expect(JSON.parse(bad.text)).toEqual({ error: { key: 'ERRORS.INVALID_QUERY_PARAM' } });
      expect((await request('/api/echo/%ZZ/extra')).text).toBe('outside:');
    });
  });

  it('keeps unmatched bodies available to the application and honors originalUrl', async () => {
    await withServer(
      adapter().setBasePath('/ops/queues'),
      async (request) => {
        expect((await request('/ops/queues/api/echo/q')).status).toBe(200);
        expect((await request('/api/echo/q')).text).toBe('outside:');
        expect((await request('/ops/queues-other/api/echo/q')).text).toBe('outside:');
        expect(
          (await request('/ops/queues/missing', { method: 'POST', body: 'application data' })).text
        ).toBe('outside:application data');
      },
      (request) => {
        Object.defineProperty(request, 'originalUrl', { value: request.url });
        request.url = request.url?.slice('/ops/queues'.length) || '/';
      }
    );
  });

  it('preserves statuses and JSON strings, and suppresses HEAD and 204 bodies', async () => {
    const text: ProbeRoute = {
      ...echo,
      route: '/api/text',
      handler: () => ({ body: 'plain value' }),
    };
    const empty: ProbeRoute = {
      ...echo,
      route: '/api/empty',
      handler: () => ({ status: 204, body: { omitted: true } }),
    };
    const conflict: ProbeRoute = {
      ...echo,
      route: '/api/conflict',
      handler: () => ({ status: 409, body: { error: { key: 'ERRORS.FORBIDDEN' } } }),
    };
    await withServer(adapter([text, empty, conflict]), async (request) => {
      const string = await request('/api/text');
      expect(string.status).toBe(200);
      expect(string.headers['content-type']).toMatch(/^application\/json/);
      expect(string.text).toBe('"plain value"');
      expect((await request('/api/text', { method: 'HEAD' })).text).toBe('');
      expect((await request('/api/conflict')).status).toBe(409);
      const result = await request('/api/empty');
      expect(result.status).toBe(204);
      expect(result.text).toBe('');
      expect(result.headers['content-type']).toBeUndefined();
      expect(result.headers['content-length']).toBeUndefined();
    });
  });

  it('uses the configured error handler and translates unconfigured failures', async () => {
    const failing: ProbeRoute = {
      ...echo,
      handler: () => {
        throw new Error('queue failure');
      },
    };
    const board = adapter([failing]).setErrorHandler((error) => ({
      status: 403,
      body: { error: { key: 'ERRORS.FORBIDDEN' }, message: error.message },
    }));
    await withServer(board, async (request) => {
      const result = await request('/api/echo/q');
      expect(result.status).toBe(403);
      expect(JSON.parse(result.text)).toEqual({
        error: { key: 'ERRORS.FORBIDDEN' },
        message: 'queue failure',
      });
    });
    await withServer(adapter([failing]), async (request) => {
      const result = await request('/api/echo/q');
      expect(result.status).toBe(500);
      expect(JSON.parse(result.text)).toEqual({ error: { key: 'ERRORS.INTERNAL_SERVER_ERROR' } });
    });
  });

  it('finishes an aborted upload and continues serving requests', async () => {
    await withServer(adapter(), async (request) => {
      await expect(
        request('/api/echo/q', {
          method: 'POST',
          abort: true,
          body: '{"partial":1}',
          headers: { expect: '100-continue' },
        })
      ).rejects.toThrow('client aborted');
      expect((await request('/api/echo/q')).status).toBe(200);
    });
  });

  it('preserves responses completed by earlier middleware', async () => {
    let calls = 0;
    const probe: ProbeRoute = {
      ...echo,
      route: ['/api/completed', '/api/open'],
      handler: () => ({ body: { calls: ++calls } }),
    };
    await withServer(
      adapter([probe]),
      async (request) => {
        expect((await request('/api/completed')).text).toBe('middleware');
        expect(JSON.parse((await request('/api/open')).text)).toEqual({ calls: 1 });
      },
      (request, response) => {
        if (request.url === '/api/completed') response.end('middleware');
      }
    );
  });

  it('returns a translated fallback when serialization or the error callback fails', async () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    const failing: ProbeRoute = { ...echo, handler: () => ({ body: circular }) };
    await withServer(adapter([failing]), async (request) => {
      const result = await request('/api/echo/q');
      expect(result.status).toBe(500);
      expect(JSON.parse(result.text)).toEqual({ error: { key: 'ERRORS.INTERNAL_SERVER_ERROR' } });
    });
    await withServer(
      adapter([failing]).setErrorHandler(() => {
        throw new Error('callback failed');
      }),
      async (request) => {
        const result = await request('/api/echo/q');
        expect(result.status).toBe(500);
        expect(JSON.parse(result.text)).toEqual({ error: { key: 'ERRORS.INTERNAL_SERVER_ERROR' } });
      }
    );
  });

  it('preserves plain-text error responses from the configured error callback', async () => {
    const failing: ProbeRoute = {
      ...echo,
      handler: () => {
        throw new Error('failure');
      },
    };
    await withServer(
      adapter([failing]).setErrorHandler(() => ({ status: 409, body: 'safe error' })),
      async (request) => {
        const result = await request('/api/echo/q');
        expect(result.status).toBe(409);
        expect(result.headers['content-type']).toMatch(/^text\/plain/);
        expect(result.text).toBe('safe error');
      }
    );
  });

  it('leaves payload validation and visibility guards in the existing API schema flow', async () => {
    const validated = new NodeAdapter();
    createBullBoard({
      queues: [],
      serverAdapter: validated,
      options: { uiBasePath: uiFixtureBasePath },
    });
    await withServer(validated, async (request) => {
      const result = await request('/api/queues/unknown/add', {
        method: 'POST',
        body: '{"name":7}',
      });
      expect(result.status).toBe(400);
      expect(JSON.parse(result.text)).toMatchObject({
        error: { key: 'ERRORS.INVALID_REQUEST_BODY' },
        code: 'INVALID_REQUEST',
      });
    });
    const guarded = new NodeAdapter();
    createBullBoard({
      queues: [],
      serverAdapter: guarded,
      options: {
        uiBasePath: uiFixtureBasePath,
        handlerHooks: { before: () => ({ allow: false }) },
      },
    });
    await withServer(guarded, async (request) => {
      const result = await request('/api/queues/unknown/add', {
        method: 'POST',
        body: '{"name":7}',
      });
      expect(result.status).toBe(403);
      expect(JSON.parse(result.text)).toMatchObject({ error: { key: 'ERRORS.FORBIDDEN' } });
    });
  });

  it('polls and adds a job through the actual API and Redis queue', async () => {
    const queue = await seedQueue('native-transport');
    const board = new NodeAdapter().setBasePath('/ui');
    createBullBoard({
      queues: [queue.adapter],
      serverAdapter: board,
      options: { uiBasePath: uiFixtureBasePath },
    });
    try {
      await withServer(board, async (request) => {
        expect((await request('/ui/api/queues')).status).toBe(200);
        const added = await request(`/ui/api/queues/${queue.name}/add`, {
          method: 'POST',
          body: JSON.stringify({ name: 'transport-job', data: { verified: true } }),
        });
        expect(added.status).toBe(200);
        const jobs = await queue.queue.getJobs(['waiting', 'paused', 'delayed']);
        expect(jobs.some((job) => job.name === 'transport-job' && job.data.verified === true)).toBe(
          true
        );
      });
    } finally {
      await queue.close();
    }
  }, 30000);
});
