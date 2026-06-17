import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { Queue } from 'bullmq';
import request from 'supertest';

describe('Pause/Resume all queues', () => {
  let serverAdapter: ExpressAdapter;
  let queueA: Queue;
  let queueB: Queue;
  let readOnlyQueue: Queue;
  let hiddenQueue: Queue;

  const connection = {
    host: process.env.REDIS_HOST || 'localhost',
    port: +(process.env.REDIS_PORT || 6379),
  };

  beforeEach(async () => {
    serverAdapter = new ExpressAdapter();
    queueA = new Queue('AllA', { connection });
    queueB = new Queue('AllB', { connection });
    readOnlyQueue = new Queue('AllReadOnly', { connection });
    hiddenQueue = new Queue('AllHidden', { connection });
    await Promise.all(
      [queueA, queueB, readOnlyQueue, hiddenQueue].map((q) =>
        q.obliterate({ force: true }).catch(() => {})
      )
    );
  });

  afterEach(async () => {
    await Promise.all(
      [queueA, queueB, readOnlyQueue, hiddenQueue].map(async (q) => {
        await q.obliterate({ force: true }).catch(() => {});
        await q.close();
      })
    );
  });

  function setupBoard() {
    const hiddenAdapter = new BullMQAdapter(hiddenQueue);
    hiddenAdapter.setVisibilityGuard(() => false);
    createBullBoard({
      queues: [
        new BullMQAdapter(queueA),
        new BullMQAdapter(queueB),
        new BullMQAdapter(readOnlyQueue, { readOnlyMode: true }),
        hiddenAdapter,
      ],
      serverAdapter,
    });
    return request(serverAdapter.getRouter());
  }

  it('pauses every writable, visible queue and skips the rest', async () => {
    await queueB.pause(); // already paused: exercises the isPaused short-circuit

    const agent = setupBoard();

    await agent.put('/api/queues/pause').expect(200);

    expect(await queueA.isPaused()).toBe(true);
    expect(await queueB.isPaused()).toBe(true);
    expect(await readOnlyQueue.isPaused()).toBe(false); // read-only: filtered out
    expect(await hiddenQueue.isPaused()).toBe(false); // not visible: skipped
  });

  it('resumes every writable, visible queue and skips the rest', async () => {
    await queueA.pause(); // queueB stays unpaused: exercises the resume short-circuit

    await readOnlyQueue.pause();
    await hiddenQueue.pause();
    const agent = setupBoard();

    await agent.put('/api/queues/resume').expect(200);

    expect(await queueA.isPaused()).toBe(false);
    expect(await queueB.isPaused()).toBe(false);
    expect(await readOnlyQueue.isPaused()).toBe(true); // read-only: filtered out
    expect(await hiddenQueue.isPaused()).toBe(true); // not visible: skipped
  });
});
