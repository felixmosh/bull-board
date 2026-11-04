import { seedQueue } from '@bull-board/test-utils';
import type { SeededQueue } from '@bull-board/test-utils';
import { createNativeHarness } from './harness';
import type { NativeHarness } from './harness';

describe('native Nest mounting', () => {
  it.each([
    { route: '', base: '', prefix: undefined },
    { route: '/ops/queues', base: '/ops/queues', prefix: undefined },
    {
      route: '/ops/queues',
      base: '/global/ops/queues',
      prefix: { prefix: 'global', board: 'included' },
    },
    {
      route: '/ops/queues',
      base: '/ops/queues',
      prefix: { prefix: 'global', board: 'excluded' },
    },
  ] satisfies {
    route: string;
    base: string;
    prefix: { prefix: string; board: 'included' | 'excluded' } | undefined;
  }[])('serves $route at $base with prefix $prefix', async ({ route, base, prefix }) => {
    const seeded = await seedQueue('native-mount');
    let harness: NativeHarness | undefined;
    try {
      harness = await createNativeHarness({
        basePath: route,
        queue: seeded,
        globalPrefix: prefix,
      });
      const page = await harness.request({ method: 'GET', path: `${base}/` });
      expect(page.status).toBe(200);
      expect(page.headers['content-type']).toContain('text/html');
      expect(page.text).toContain(`<base href="${base}/"`);
      const asset = await harness.request({
        method: 'GET',
        path: `${base}/static/test-asset.txt`,
      });
      expect(asset.status).toBe(200);
      expect(asset.text.trim()).toBe('bull-board-static-fixture');
      const poll = await harness.request({ method: 'GET', path: `${base}/api/queues` });
      expect(poll.status).toBe(200);
      expect(JSON.parse(poll.text)).toMatchObject({
        queues: expect.arrayContaining([expect.objectContaining({ name: seeded.name })]),
      });
      const mutation = await harness.request({
        method: 'POST',
        path: `${base}/api/queues/${seeded.name}/add`,
        body: { name: 'mounted-job', data: { base } },
      });
      expect(mutation.status).toBe(200);
      expect(await seeded.queue.getJobs(['waiting'])).toEqual(
        expect.arrayContaining([expect.objectContaining({ name: 'mounted-job', data: { base } })])
      );
      expect(harness.observations.downstream).toBe(0);
      const applicationPrefix = prefix ? '/global' : '';
      const health = await harness.request({ method: 'GET', path: `${applicationPrefix}/health` });
      expect(health.status).toBe(200);
      expect(JSON.parse(health.text)).toEqual({ application: true });
      const fallback = await harness.request({
        method: 'GET',
        path: `${base}/downstream`,
      });
      expect(fallback.status).toBe(200);
      expect(JSON.parse(fallback.text)).toEqual({ downstream: 1 });
      if (prefix) {
        const wrongBase = prefix.board === 'included' ? route : `/global${route}`;
        expect((await harness.request({ method: 'GET', path: `${wrongBase}/` })).status).toBe(404);
      }
    } finally {
      await harness?.teardown();
      await seeded.close();
    }
  });
});

describe('native Nest async configuration and middleware', () => {
  let seeded: SeededQueue;
  let harness: NativeHarness;
  const origins: (string | undefined)[] = [];
  const allowed = { authorization: 'Bearer allowed', origin: 'https://allowed.example' };

  beforeAll(async () => {
    seeded = await seedQueue('native-auth');
    harness = await createNativeHarness({
      basePath: '/ui',
      queue: seeded,
      configuration: 'async',
      middleware: (request, response, next) => {
        origins.push(request.headers.origin);
        if (request.headers.authorization !== 'Bearer allowed') {
          response.statusCode = 401;
          response.end('authentication required');
          return;
        }
        if (request.headers.origin && request.headers.origin !== 'https://allowed.example') {
          response.statusCode = 403;
          response.end('origin denied');
          return;
        }
        next();
      },
    });
  });
  afterAll(async () => {
    await harness?.teardown();
    await seeded?.close();
  });

  it.each(['/', '/static/test-asset.txt', '/api/queues'])(
    'authenticates requests to /ui%s before board handling',
    async (path) => {
      const denied = await harness.request({ method: 'GET', path: `/ui${path}` });
      expect(denied.status).toBe(401);
      expect(denied.text).toBe('authentication required');
      const accepted = await harness.request({
        method: 'GET',
        path: `/ui${path}`,
        headers: allowed,
      });
      expect(accepted.status).toBe(200);
      expect(accepted.headers['access-control-allow-origin']).toBeUndefined();
    }
  );

  it('denies mutations without queue side effects and adds an allowed job once', async () => {
    const body = { name: 'protected-job', data: { authenticated: true } };
    const path = `/ui/api/queues/${seeded.name}/add`;
    const count = await seeded.queue.getWaitingCount();
    expect((await harness.request({ method: 'POST', path, body })).status).toBe(401);
    expect(await seeded.queue.getWaitingCount()).toBe(count);
    expect((await harness.request({ method: 'POST', path, body, headers: allowed })).status).toBe(
      200
    );
    expect(await seeded.queue.getWaitingCount()).toBe(count + 1);
    expect(harness.observations.downstream).toBe(0);
  });

  it('preserves the original Origin for application policy without adding CORS headers', async () => {
    const path = `/ui/api/queues/${seeded.name}/add`;
    const count = await seeded.queue.getWaitingCount();
    const denied = await harness.request({
      method: 'POST',
      path,
      body: { name: 'blocked-origin', data: {} },
      headers: { ...allowed, origin: 'https://blocked.example' },
    });
    expect(denied.status).toBe(403);
    expect(denied.text).toBe('origin denied');
    expect(denied.headers['access-control-allow-origin']).toBeUndefined();
    expect(await seeded.queue.getWaitingCount()).toBe(count);
    const accepted = await harness.request({
      method: 'GET',
      path: '/ui/api/queues',
      headers: allowed,
    });
    expect(accepted.status).toBe(200);
    expect(accepted.headers['access-control-allow-origin']).toBeUndefined();
    expect(origins).toContain('https://blocked.example');
    expect(origins).toContain('https://allowed.example');
    expect(
      (
        await harness.request({
          method: 'GET',
          path: '/ui/api/queues',
          headers: { authorization: 'Bearer allowed' },
        })
      ).status
    ).toBe(200);
    expect(origins).toContain(undefined);
  });

  it('leaves routes outside the protected mount reachable', async () => {
    const response = await harness.request({ method: 'GET', path: '/health' });
    expect(response.status).toBe(200);
    expect(JSON.parse(response.text)).toEqual({ application: true });
  });
});

describe.each([true, false])('native Nest with bodyParser=%s', (bodyParser) => {
  let seeded: SeededQueue;
  let harness: NativeHarness;
  const observedBodies: { body: unknown; ended: boolean }[] = [];

  beforeAll(async () => {
    seeded = await seedQueue('native-body');
    harness = await createNativeHarness({
      basePath: '/ui',
      queue: seeded,
      bodyParser,
      middleware: (request, _response, next) => {
        observedBodies.push({
          body: 'body' in request ? request.body : undefined,
          ended: request.readableEnded,
        });
        next();
      },
    });
  });
  afterAll(async () => {
    await harness?.teardown();
    await seeded?.close();
  });

  it('adds the JSON payload once with parsed or unread request streams', async () => {
    observedBodies.length = 0;
    const body = { name: 'json-job', data: { nested: { answer: 42 }, text: 'native' } };
    const count = await seeded.queue.getWaitingCount();
    const response = await harness.request({
      method: 'POST',
      path: `/ui/api/queues/${seeded.name}/add`,
      body,
    });
    expect(response.status).toBe(200);
    expect(await seeded.queue.getWaitingCount()).toBe(count + 1);
    expect(await seeded.queue.getJobs(['waiting'])).toEqual(
      expect.arrayContaining([expect.objectContaining(body)])
    );
    expect(observedBodies).toEqual([
      bodyParser ? { body, ended: true } : { body: undefined, ended: false },
    ]);
    expect(harness.observations.downstream).toBe(0);
  });

  it('accepts bodyless and explicitly empty actions without waiting for another stream read', async () => {
    const path = `/ui/api/queues/${seeded.name}/pause`;
    expect((await harness.request({ method: 'PUT', path })).status).toBe(200);
    expect(await seeded.queue.isPaused()).toBe(true);
    await seeded.queue.resume();
    expect((await harness.requestRaw({ method: 'PUT', path, payload: '' })).status).toBe(200);
    expect(await seeded.queue.isPaused()).toBe(true);
    await seeded.queue.resume();
  });

  it('rejects malformed JSON finitely without adding a job', async () => {
    const count = await seeded.queue.getWaitingCount();
    const response = await harness.requestRaw({
      method: 'POST',
      path: `/ui/api/queues/${seeded.name}/add`,
      payload: '{"name":',
    });
    expect(response.status).toBe(400);
    expect(response.headers['content-type']).toContain('application/json');
    expect(await seeded.queue.getWaitingCount()).toBe(count);
    expect((await harness.request({ method: 'GET', path: '/ui/api/queues' })).status).toBe(200);
    expect(harness.observations.downstream).toBe(0);
  });
});

describe('native Nest response and application lifecycle', () => {
  it('completes a 204 action once without a body or downstream dispatch', async () => {
    const seeded = await seedQueue('native-completion');
    let harness: NativeHarness | undefined;
    let finishes = 0;
    const errors: Error[] = [];
    try {
      harness = await createNativeHarness({
        basePath: '/ui',
        queue: seeded,
        middleware: (_request, response, next) => {
          response.on('finish', () => {
            finishes += 1;
          });
          response.on('error', (error: Error) => {
            errors.push(error);
          });
          next();
        },
        boardOptions: {
          handlerHooks: {
            after: (context, result) =>
              context.route.endsWith('/pause') ? { status: 204, body: { ignored: true } } : result,
          },
        },
      });
      const response = await harness.request({
        method: 'PUT',
        path: `/ui/api/queues/${seeded.name}/pause`,
      });
      expect(response.status).toBe(204);
      expect(response.text).toBe('');
      expect(response.headers['content-type']).toBeUndefined();
      expect(response.headers['content-length']).toBeUndefined();
      expect(await seeded.queue.isPaused()).toBe(true);
      expect(finishes).toBe(1);
      expect(errors).toEqual([]);
      expect(harness.observations.downstream).toBe(0);
    } finally {
      await harness?.teardown();
      await seeded.close();
    }
  });

  it('closes the HTTP listener and the queue connection owned by Nest', async () => {
    const seeded = await seedQueue('native-shutdown');
    let harness: NativeHarness | undefined;
    try {
      harness = await createNativeHarness({ basePath: '/ui', queue: seeded });
      expect(harness.server.listening).toBe(true);
      const client = await harness.queue.client;
      expect(client.status).toBe('ready');
      expect((await harness.request({ method: 'GET', path: '/ui/api/queues' })).status).toBe(200);
      await harness.teardown();
      expect(harness.server.listening).toBe(false);
      expect(harness.queue.closing).toBeDefined();
      await harness.queue.closing;
      expect(client.status).toBe('end');
      await expect(
        harness.request({ method: 'GET', path: '/ui/api/queues' })
      ).rejects.toMatchObject({
        code: 'ECONNREFUSED',
      });
    } finally {
      if (harness?.server.listening) await harness.teardown();
      await seeded.close();
    }
  });
});
