import { seedQueue, SeededQueue } from './redisFixtures';

export interface NormalizedResponse {
  status: number;
  headers: Record<string, string | string[]>;
  text: string;
}

export interface ContractRequest {
  method: string;
  path: string;
  body?: unknown;
}

export interface Harness {
  /** Issue an HTTP request against the mounted board; path is absolute incl. basePath prefix. */
  request: (req: ContractRequest) => Promise<NormalizedResponse>;
  teardown: () => Promise<void>;
}

/**
 * @param name      adapter display name
 * @param makeHarness  builds a board on the adapter under test, mounted at `basePath`,
 *                     seeded with `queue`, returning a normalized request fn + teardown.
 *
 * Note: consuming test suites must configure `testTimeout` >= 30000 -- Redis and server
 * setup in `beforeAll` can take several seconds in CI.
 */
export function runServerAdapterContract(
  name: string,
  makeHarness: (opts: { basePath: string; queue: SeededQueue }) => Promise<Harness>
): void {
  describe(`${name} server adapter contract`, () => {
    describe('mounted at root', () => {
      let queue: SeededQueue;
      let harness: Harness;
      const prefix = '';

      beforeAll(async () => {
        queue = await seedQueue();
        harness = await makeHarness({ basePath: prefix, queue });
      });
      afterAll(async () => {
        await harness.teardown();
        await queue.close();
      });

      it('serves the entry HTML with injected basePath + uiConfig', async () => {
        const res = await harness.request({ method: 'get', path: `${prefix}/` });
        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toMatch(/html/);
        // `boardTitle` only reaches the HTML via the serialized uiConfig, so its
        // presence proves the config was actually injected (not just the template id).
        expect(res.text).toContain('boardTitle');
      });

      it('serves static assets', async () => {
        const res = await harness.request({
          method: 'get',
          path: `${prefix}/static/test-asset.txt`,
        });
        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toMatch(/text/);
        expect(res.text).toContain('bull-board-static-fixture');
      });

      it('GET /api/queues returns the seeded queue as JSON', async () => {
        const res = await harness.request({ method: 'get', path: `${prefix}/api/queues` });
        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toMatch(/json/);
        const body = JSON.parse(res.text);
        expect(body.queues.map((q: any) => q.name)).toContain(queue.name);
      });

      it('POST /api/queues/:name/add parses the body and adds a job', async () => {
        const res = await harness.request({
          method: 'post',
          path: `${prefix}/api/queues/${queue.name}/add`,
          body: { data: { from: 'contract' }, name: '__default__' },
        });
        expect(res.status).toBeGreaterThanOrEqual(200);
        expect(res.status).toBeLessThan(300);
        const jobs = await queue.queue.getJobs(['waiting', 'paused', 'delayed']);
        expect(jobs.some((j) => (j.data as any)?.from === 'contract')).toBe(true);
      });

      it('PUT /api/queues/:name/pause returns success', async () => {
        const res = await harness.request({
          method: 'put',
          path: `${prefix}/api/queues/${queue.name}/pause`,
        });
        expect(res.status).toBeGreaterThanOrEqual(200);
        expect(res.status).toBeLessThan(300);
        expect(await queue.queue.isPaused()).toBe(true);
      });

      it('returns a structured 404 for an unknown queue', async () => {
        const res = await harness.request({
          method: 'put',
          path: `${prefix}/api/queues/__does_not_exist__/pause`,
        });
        expect(res.status).toBe(404);
        expect(res.text).toContain('Queue not found');
      });
    });

    describe('mounted under /ui (basePath)', () => {
      let queue: SeededQueue;
      let harness: Harness;
      const prefix = '/ui';

      beforeAll(async () => {
        queue = await seedQueue();
        harness = await makeHarness({ basePath: prefix, queue });
      });
      afterAll(async () => {
        await harness.teardown();
        await queue.close();
      });

      it('resolves API routes under the prefix', async () => {
        const res = await harness.request({ method: 'get', path: `${prefix}/api/queues` });
        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toMatch(/json/);
        const body = JSON.parse(res.text);
        expect(body.queues.map((q: any) => q.name)).toContain(queue.name);
      });

      it('injects basePath into the entry HTML', async () => {
        const res = await harness.request({ method: 'get', path: `${prefix}/` });
        expect(res.status).toBe(200);
        expect(res.text).toContain(`<base href="${prefix}/"`);
      });
    });
  });
}
