import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { Queue } from 'bullmq';
import request from 'supertest';
import { STATUSES } from '../../src/constants/statuses';
import { assertResolvedMajor, destroyQueue, EXPECTED_MAJOR, isV6, makeQueue } from './helpers';

describe(`Handlers on bullmq@${EXPECTED_MAJOR}`, () => {
  assertResolvedMajor();

  let queue: Queue;

  beforeEach(async () => {
    queue = await makeQueue('handlers');
  });

  afterEach(async () => {
    await destroyQueue(queue);
  });

  function setupBoard() {
    const serverAdapter = new ExpressAdapter();
    createBullBoard({ queues: [new BullMQAdapter(queue)], serverAdapter });
    return request(serverAdapter.getRouter());
  }

  it('creates independent schedulers with persisted templates and supports later schedule edits', async () => {
    const board = setupBoard();
    const path = `/api/queues/${queue.name}/job-schedulers`;

    for (let index = 0; index < 2; index++) {
      await board
        .post(path)
        .send({
          id: `report-${index}`,
          name: 'report',
          data: { scope: 'daily' },
          repeat: { pattern: '0 3 * * *', tz: 'Europe/Warsaw', limit: 5 },
        })
        .expect(204);
    }

    const schedulers = await queue.getJobSchedulers();
    expect(schedulers).toHaveLength(2);
    expect(schedulers.map(({ key }) => key).sort()).toEqual(['report-0', 'report-1']);
    for (const scheduler of schedulers) {
      expect(scheduler).toMatchObject({
        name: 'report',
        pattern: '0 3 * * *',
        tz: 'Europe/Warsaw',
        limit: 5,
        template: { data: { scope: 'daily' } },
      });
    }

    await board.patch(`${path}/${schedulers[0].key}`).send({ every: 60_000 }).expect(204);

    const updated = await queue.getJobScheduler(schedulers[0].key);
    expect(Number(updated?.every)).toBe(60_000);
    expect(updated?.name).toBe('report');
    expect(updated?.template?.data).toEqual({ scope: 'daily' });
    expect((await queue.getJobScheduler(schedulers[1].key))?.pattern).toBe('0 3 * * *');
  });

  it('rejects an invalid scheduler pattern without persisting a scheduler', async () => {
    const { body } = await setupBoard()
      .post(`/api/queues/${queue.name}/job-schedulers`)
      .send({ id: 'report', name: 'report', repeat: { pattern: 'not a cron' } })
      .expect(400);

    expect(body.error).toEqual({ key: 'ERRORS.INVALID_SCHEDULER_PATTERN' });
    expect(await queue.getJobSchedulersCount()).toBe(0);
  });

  it('serves redis stats', async () => {
    const res = await setupBoard().get('/api/redis/stats').expect(200);

    expect(res.body.backend).toBe('redis');
    expect(res.body.version).toEqual(expect.any(String));
    expect(res.body.memory.used).toEqual(expect.any(Number));
  });

  it('lists the queue with finite pagination while paused', async () => {
    await queue.pause();
    await queue.add('job', { hello: 'world' });

    const res = await setupBoard().get('/api/queues').expect(200);
    const [appQueue] = res.body.queues;

    expect(appQueue.isPaused).toBe(true);
    expect(Number.isFinite(appQueue.pagination.pageCount)).toBe(true);
    expect(appQueue.statuses.includes(STATUSES.paused)).toBe(!isV6());

    // Every advertised status must have a real count behind it, otherwise pagination
    // arithmetic over the "latest" bucket silently produces NaN.
    for (const status of appQueue.statuses) {
      if (status === STATUSES.latest) continue;
      expect(appQueue.counts[status]).toEqual(expect.any(Number));
    }
  });

  it('serves the job under whichever status the queue advertises for it', async () => {
    await queue.pause();
    await queue.add('job', { hello: 'world' });

    const bucket = isV6() ? STATUSES.waiting : STATUSES.paused;
    const res = await setupBoard().get(`/api/queues?status=${bucket}`).expect(200);
    const [appQueue] = res.body.queues;

    expect(appQueue.counts[bucket]).toBe(1);
    expect(Number.isFinite(appQueue.pagination.pageCount)).toBe(true);
  });
});
