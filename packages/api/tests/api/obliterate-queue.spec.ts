import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { Queue, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import request from 'supertest';

describe('Obliterate Queue', () => {
  let serverAdapter: ExpressAdapter;
  let testQueue: Queue;
  let redis: Redis;
  let worker: Worker | undefined;
  const connection = {
    host: process.env.REDIS_HOST || 'localhost',
    port: +(process.env.REDIS_PORT || 6379),
  };

  beforeAll(() => {
    redis = new Redis(connection);
  });

  afterAll(() => redis.disconnect());

  beforeEach(async () => {
    serverAdapter = new ExpressAdapter();
    testQueue = new Queue('ObliterateTest', { connection });

    // Clear queue before each test
    await testQueue.drain();
    await testQueue.clean(0, 1000);
  });

  afterEach(async () => {
    // Closing the worker first releases the job it holds, so the teardown obliterate is not the
    // one racing it.
    await worker?.close(true);
    worker = undefined;

    try {
      await testQueue.obliterate({ force: true });
    } catch (error) {
      // Queue might already be obliterated
    }
    await testQueue.close();
  });

  /** Starts a worker that takes one job and holds it active until the returned release is called. */
  async function holdOneJobActive(): Promise<() => void> {
    let releaseJob!: () => void;
    const held = new Promise<void>((resolve) => (releaseJob = resolve));

    worker = new Worker(testQueue.name, async (): Promise<any> => held, {
      connection,
      autorun: true,
    });
    // A forced obliterate deletes the keys the worker is holding a lock on, so it errors out.
    worker.on('error', () => undefined);

    await testQueue.add('held-job', { data: 'held' });

    const deadline = Date.now() + 20_000;
    while (Date.now() < deadline && (await testQueue.getActiveCount()) === 0) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    return releaseJob;
  }

  it('should successfully obliterate a paused queue', async () => {
    // Create board with queue
    createBullBoard({
      queues: [new BullMQAdapter(testQueue)],
      serverAdapter,
    });

    // Add some jobs to the queue
    await testQueue.add('test-job-1', { data: 'test1' });
    await testQueue.add('test-job-2', { data: 'test2' });

    // Verify jobs exist
    const jobsBefore = await testQueue.getJobs();
    expect(jobsBefore.length).toBeGreaterThan(0);

    // Pause the queue
    await testQueue.pause();

    // Verify queue is paused
    const isPaused = await testQueue.isPaused();
    expect(isPaused).toBe(true);

    // Obliterate the queue via API
    await request(serverAdapter.getRouter())
      .put(`/api/queues/${testQueue.name}/obliterate`)
      .expect(200);

    // Verify queue was obliterated - trying to get jobs should fail or return empty
    // After obliteration, the queue data structure should be gone
    const keysAfter = await redis.keys(`bull:${testQueue.name}:*`);
    expect(keysAfter).toHaveLength(0);
  });

  it('should return 400 when trying to obliterate a running queue', async () => {
    // Create board with queue
    createBullBoard({
      queues: [new BullMQAdapter(testQueue)],
      serverAdapter,
    });

    // Add a job to the queue
    await testQueue.add('test-job', { data: 'test' });

    // Ensure queue is NOT paused
    await testQueue.resume();
    const isPaused = await testQueue.isPaused();
    expect(isPaused).toBe(false);

    // Try to obliterate the running queue - should fail
    await request(serverAdapter.getRouter())
      .put(`/api/queues/${testQueue.name}/obliterate`)
      .expect(400)
      .expect('Content-Type', /json/)
      .then((res) => {
        const body = JSON.parse(res.text);
        expect(body.error).toEqual({ key: 'ERRORS.QUEUE_NOT_PAUSED' });
      });

    // Verify queue still exists
    const jobsAfter = await testQueue.getJobs();
    expect(jobsAfter.length).toBeGreaterThan(0);
  });

  it('should return 405 when trying to obliterate in read-only mode', async () => {
    // Create board with queue in read-only mode
    createBullBoard({
      queues: [new BullMQAdapter(testQueue, { readOnlyMode: true })],
      serverAdapter,
    });

    // Add a job and pause the queue
    await testQueue.add('test-job', { data: 'test' });
    await testQueue.pause();

    // Verify queue is paused
    const isPaused = await testQueue.isPaused();
    expect(isPaused).toBe(true);

    // Try to obliterate - should fail with 405 due to read-only mode
    await request(serverAdapter.getRouter())
      .put(`/api/queues/${testQueue.name}/obliterate`)
      .expect(405);

    // Verify queue still exists
    const jobsAfter = await testQueue.getJobs();
    expect(jobsAfter.length).toBeGreaterThan(0);
  });

  it('should return 404 when trying to obliterate a non-existent queue', async () => {
    // Create board with a different queue
    createBullBoard({
      queues: [new BullMQAdapter(testQueue)],
      serverAdapter,
    });

    // Try to obliterate a queue that doesn't exist
    await request(serverAdapter.getRouter())
      .put('/api/queues/NonExistentQueue/obliterate')
      .expect(404);
  });

  it('should obliterate queue with delayed jobs', async () => {
    // Create board with queue
    createBullBoard({
      queues: [new BullMQAdapter(testQueue)],
      serverAdapter,
    });

    // Add delayed jobs
    await testQueue.add('delayed-job-1', { data: 'test1' }, { delay: 10000 });
    await testQueue.add('delayed-job-2', { data: 'test2' }, { delay: 20000 });

    // Verify delayed jobs exist
    const delayedJobs = await testQueue.getDelayed();
    expect(delayedJobs.length).toBe(2);

    // Pause the queue
    await testQueue.pause();

    // Obliterate the queue
    await request(serverAdapter.getRouter())
      .put(`/api/queues/${testQueue.name}/obliterate`)
      .expect(200);

    // Verify all Redis keys are gone
    const keysAfter = await redis.keys(`bull:${testQueue.name}:*`);
    expect(keysAfter).toHaveLength(0);
  });

  it('should report a conflict when the queue still has active jobs', async () => {
    createBullBoard({
      queues: [new BullMQAdapter(testQueue)],
      serverAdapter,
    });

    const releaseJob = await holdOneJobActive();
    expect(await testQueue.getActiveCount()).toBe(1);

    await testQueue.pause();

    const { body } = await request(serverAdapter.getRouter())
      .put(`/api/queues/${testQueue.name}/obliterate`)
      .expect(409);

    // A bare "Internal server error" is what this used to be, which said nothing about the active
    // jobs nor about the force option that gets past them.
    expect(body.error).toEqual({ key: 'ERRORS.QUEUE_HAS_ACTIVE_JOBS' });
    expect(body.message).toEqual({ key: 'ERRORS.QUEUE_HAS_ACTIVE_JOBS_DETAILS' });

    const keysAfter = await redis.keys(`bull:${testQueue.name}:*`);
    expect(keysAfter.length).toBeGreaterThan(0);

    releaseJob();
  });

  it('should obliterate a queue with active jobs when force is passed', async () => {
    createBullBoard({
      queues: [new BullMQAdapter(testQueue)],
      serverAdapter,
    });

    const releaseJob = await holdOneJobActive();
    expect(await testQueue.getActiveCount()).toBe(1);

    await testQueue.pause();

    await request(serverAdapter.getRouter())
      .put(`/api/queues/${testQueue.name}/obliterate`)
      .send({ force: true })
      .expect(200);

    const keysAfter = await redis.keys(`bull:${testQueue.name}:*`);
    expect(keysAfter).toHaveLength(0);

    releaseJob();
  });

  it('should obliterate queue with completed jobs', async () => {
    // Create board with queue
    createBullBoard({
      queues: [new BullMQAdapter(testQueue)],
      serverAdapter,
    });

    // Add jobs and mark them as completed
    const job1 = await testQueue.add('completed-job-1', { data: 'test1' });
    const job2 = await testQueue.add('completed-job-2', { data: 'test2' });

    // Simulate completion by removing from waiting and adding to completed
    await job1.remove();
    await job2.remove();

    // Add some regular jobs too
    await testQueue.add('regular-job', { data: 'test3' });

    // Pause the queue
    await testQueue.pause();

    // Obliterate the queue
    await request(serverAdapter.getRouter())
      .put(`/api/queues/${testQueue.name}/obliterate`)
      .expect(200);

    // Verify all Redis keys are gone
    const keysAfter = await redis.keys(`bull:${testQueue.name}:*`);
    expect(keysAfter).toHaveLength(0);
  });
});
