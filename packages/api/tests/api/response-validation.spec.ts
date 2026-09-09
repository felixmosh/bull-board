import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { Queue } from 'bullmq';
import request from 'supertest';
import * as v from 'valibot';
import { responseSchemas } from '../../src/schemas/responses';

const connection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: +(process.env.REDIS_PORT || 6379),
};

describe('response validation', () => {
  let queue: Queue;

  beforeEach(async () => {
    queue = new Queue('ResponseValidationQueue', { connection });
    await queue.obliterate({ force: true }).catch(() => {});
    await queue.add('done', { hello: 'world' });
    await queue.add('later', {}, { delay: 60_000 });
  });

  afterEach(async () => {
    await queue.obliterate({ force: true }).catch(() => {});
    await queue.close();
  });

  function board(options: Parameters<typeof createBullBoard>[0]['options'] = { uiConfig: {} }) {
    const serverAdapter = new ExpressAdapter();
    createBullBoard({ queues: [new BullMQAdapter(queue)], serverAdapter, options });
    return request(serverAdapter.getRouter());
  }

  it('answers real bodies that match the schemas their routes declare', async () => {
    const agent = board({ uiConfig: {}, validateResponses: true });
    const jobId = (await queue.getJobs(['waiting']))[0].id;

    await agent.get('/api/queues?activeQueue=ResponseValidationQueue&status=latest').expect(200);
    await agent.get(`/api/queues/ResponseValidationQueue/${jobId}`).expect(200);
    await agent.get(`/api/queues/ResponseValidationQueue/${jobId}/logs`).expect(200);
    await agent.get('/api/queues/ResponseValidationQueue/workers').expect(200);
    await agent.get('/api/queues/ResponseValidationQueue/rate-limit').expect(200);
    await agent.get('/api/queues/ResponseValidationQueue/default-job-options').expect(200);
    await agent.get('/api/job-schedulers').expect(200);
  });

  it('parses a live queue listing against GetQueuesResponse', async () => {
    const { body } = await board()
      .get('/api/queues?activeQueue=ResponseValidationQueue&status=latest')
      .expect(200);

    const parsed = v.safeParse(responseSchemas.GetQueuesResponse, body);
    expect(parsed.issues?.map((issue) => issue.message)).toBeUndefined();
  });

  it('answers 500 when an after hook returns a body the route does not declare', async () => {
    const agent = board({
      uiConfig: {},
      validateResponses: true,
      handlerHooks: { after: () => ({ status: 200, body: { queues: 'not an array' } as any }) },
    });

    const { body } = await agent.get('/api/queues').expect(500);

    expect(body.code).toBe('RESPONSE_SCHEMA_MISMATCH');
    expect(body.error).toEqual({ key: 'ERRORS.INTERNAL_SERVER_ERROR' });
  });

  it('leaves the same body alone when the check is off, which is the default', async () => {
    const agent = board({
      uiConfig: {},
      handlerHooks: { after: () => ({ status: 200, body: { queues: 'not an array' } as any }) },
    });

    const { body } = await agent.get('/api/queues').expect(200);

    expect(body.queues).toBe('not an array');
  });
});
