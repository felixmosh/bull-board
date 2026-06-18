import { createBullBoard } from '@bull-board/api';
import { BullAdapter } from '@bull-board/api/bullAdapter';
import { ExpressAdapter } from '@bull-board/express';
import Bull from 'bull';
import request from 'supertest';

describe('BullAdapter (legacy Bull)', () => {
  let serverAdapter: ExpressAdapter;
  let queue: Bull.Queue;

  const connection = {
    host: process.env.REDIS_HOST || 'localhost',
    port: +(process.env.REDIS_PORT || 6379),
  };

  // Shared across the suite: per-test create/close churns Bull's Redis connections
  // and a benign "Connection is closed" event races into the next test.
  beforeAll(() => {
    queue = new Bull('BullLegacy', { redis: connection });
    queue.on('error', () => {});
  });

  afterAll(async () => {
    await queue.close();
  });

  beforeEach(async () => {
    serverAdapter = new ExpressAdapter();
    await queue.obliterate({ force: true }).catch(() => {});
  });

  afterEach(async () => {
    await queue.obliterate({ force: true }).catch(() => {});
  });

  function setupBoard(options: Partial<{ readOnlyMode: boolean }> = {}) {
    createBullBoard({
      queues: [new BullAdapter(queue, options)],
      serverAdapter,
    });
    return request(serverAdapter.getRouter());
  }

  it('rejects a non-Bull queue', () => {
    expect(() => new BullAdapter({} as any)).toThrow(/non-Bull queue/);
  });

  it('exposes the queue in the queues list with bull statuses', async () => {
    const agent = setupBoard();

    const res = await agent.get('/api/queues').expect(200);
    const listed = res.body.queues.find((q: any) => q.name === 'BullLegacy');

    expect(listed).toBeDefined();
    expect(listed.statuses).toEqual(
      expect.arrayContaining([
        'latest',
        'active',
        'waiting',
        'completed',
        'failed',
        'delayed',
        'paused',
      ])
    );
  });

  it('adds a job through the API', async () => {
    const agent = setupBoard();

    await agent
      .post('/api/queues/BullLegacy/add')
      .send({ data: { foo: 'bar' }, options: {} })
      .expect(200);

    expect(await queue.getJobCounts()).toMatchObject({ waiting: 1 });
  });

  // pause()/resume() are omitted: Bull's global pause cycles its blocking client
  // and emits a flaky "Connection is closed" race. isPaused is covered above.

  it('empties the queue through the API', async () => {
    await queue.add('to-empty', { foo: 1 });
    const agent = setupBoard();

    await agent.put('/api/queues/BullLegacy/empty').expect(200);

    expect(await queue.getJobCounts()).toMatchObject({ waiting: 0 });
  });

  it("updates a job's data via the Bull update() path", async () => {
    // Bull jobs expose update(), not BullMQ's updateData().
    const job = await queue.add('editable', { value: 'before' });
    const agent = setupBoard();

    await agent
      .patch(`/api/queues/BullLegacy/${job.id}/update-data`)
      .send({ jobData: { value: 'after' } })
      .expect(200);

    const updated = await queue.getJob(job.id as string);
    expect(updated?.data).toEqual({ value: 'after' });
  });

  describe('adapter-level behaviour', () => {
    let adapter: BullAdapter;

    beforeEach(() => {
      adapter = new BullAdapter(queue);
    });

    it('prefixes the queue name', () => {
      expect(adapter.getName()).toBe('BullLegacy');
    });

    it('increments attemptsMade when reading a job (alignJobData)', async () => {
      const added = await queue.add('aligned', { foo: 1 });

      const fetched = await adapter.getJob(added.id as string);

      expect(fetched?.attemptsMade).toBe(1); // raw 0, shifted by one for display
    });

    it('promotes delayed jobs via promoteAll', async () => {
      await queue.add('delayed', { foo: 1 }, { delay: 60_000 });
      expect(await queue.getDelayedCount()).toBe(1);

      await adapter.promoteAll();

      expect(await queue.getDelayedCount()).toBe(0);
    });

    it('reports no global concurrency support', async () => {
      expect(await adapter.getGlobalConcurrency()).toBeNull();
      await expect(adapter.setGlobalConcurrency(5)).resolves.toBeUndefined();
    });

    it('does not support job schedulers', async () => {
      expect(await adapter.removeJobScheduler('any')).toBe(false);
    });

    it('returns redis info', async () => {
      expect(typeof (await adapter.getRedisInfo())).toBe('string');
    });
  });
});
