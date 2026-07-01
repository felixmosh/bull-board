import { createBullBoard } from '@bull-board/api';
import { BullAdapter } from '@bull-board/api/bullAdapter';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { BaseAdapter } from '@bull-board/api/dist/queueAdapters/base';
import { ExpressAdapter } from '@bull-board/express';
import Bull from 'bull';
import { Queue } from 'bullmq';
import request from 'supertest';

const connection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: +(process.env.REDIS_PORT || 6379),
};

async function fetchDefaultJobOptions(serverAdapter: ExpressAdapter, queueName: string) {
  const res = await request(serverAdapter.getRouter())
    .get(`/api/queues/${encodeURIComponent(queueName)}/default-job-options`)
    .expect(200);
  return JSON.parse(res.text);
}

describe('Default job options', () => {
  let serverAdapter: ExpressAdapter;

  beforeEach(() => {
    serverAdapter = new ExpressAdapter();
  });

  describe('BullMQAdapter', () => {
    let queue: Queue;

    afterEach(async () => {
      await queue.obliterate({ force: true }).catch(() => {});
      await queue.close();
    });

    it('exposes the configured default job options', async () => {
      queue = new Queue('DefaultsBullMQ', {
        connection,
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 2000 },
          removeOnComplete: 100,
        },
      });
      createBullBoard({ queues: [new BullMQAdapter(queue)], serverAdapter });

      const defaultJobOptions = await fetchDefaultJobOptions(serverAdapter, 'DefaultsBullMQ');
      expect(defaultJobOptions).toMatchObject({
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: 100,
      });
    });

    it('returns an empty object when none are configured', async () => {
      queue = new Queue('NoDefaultsBullMQ', { connection });
      createBullBoard({ queues: [new BullMQAdapter(queue)], serverAdapter });

      const defaultJobOptions = await fetchDefaultJobOptions(serverAdapter, 'NoDefaultsBullMQ');
      expect(defaultJobOptions).toEqual({});
    });
  });

  describe('BaseAdapter', () => {
    it('returns an empty object when the adapter does not override it', () => {
      const getDefaults = BaseAdapter.prototype.getQueueDefaultJobOptions;
      expect(getDefaults.call({} as any)).toEqual({});
    });
  });

  describe('BullAdapter', () => {
    let queue: Bull.Queue;

    afterEach(async () => {
      await queue.obliterate({ force: true }).catch(() => {});
      await queue.close();
    });

    it('exposes the configured default job options', async () => {
      queue = new Bull('DefaultsBull', {
        redis: connection,
        defaultJobOptions: { attempts: 5, delay: 1000 },
      });
      queue.on('error', () => {});
      createBullBoard({ queues: [new BullAdapter(queue)], serverAdapter });

      const defaultJobOptions = await fetchDefaultJobOptions(serverAdapter, 'DefaultsBull');
      expect(defaultJobOptions).toMatchObject({ attempts: 5, delay: 1000 });
    });

    it('returns an empty object when none are configured', async () => {
      queue = new Bull('NoDefaultsBull', { redis: connection });
      queue.on('error', () => {});
      createBullBoard({ queues: [new BullAdapter(queue)], serverAdapter });

      const defaultJobOptions = await fetchDefaultJobOptions(serverAdapter, 'NoDefaultsBull');
      expect(defaultJobOptions).toEqual({});
    });
  });
});
