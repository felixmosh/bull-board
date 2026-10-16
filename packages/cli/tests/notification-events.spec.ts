import Bull from 'bull';
import { Queue, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import type { FailedJobEvent } from '../src/notifications/format';
import { createQueueFactory } from '../src/queueFactory';
import type { QueueHandle } from '../src/registry';

const connection = {
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: +(process.env.REDIS_PORT || 6379),
  maxRetriesPerRequest: null,
};
const until = async (check: () => boolean | Promise<boolean>) => {
  const deadline = Date.now() + 5000;
  while (!(await check())) {
    if (Date.now() > deadline) throw new Error('Timed out waiting for queue event');
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
};

describe.each(['bullmq', 'bull'] as const)('%s terminal failures', (lib) => {
  let client: Redis;
  const resources: { close(): Promise<unknown> }[] = [];
  let handle: QueueHandle;
  let events: FailedJobEvent[];
  let warnings: string[];
  let name: string;
  const prefix = 'notification-test';
  beforeEach(async () => {
    name = `failure-${lib}-${Date.now()}`;
    client = new Redis(connection);
    await client.ping();
    events = [];
    warnings = [];
  });
  afterEach(async () => {
    await Promise.all(
      resources
        .splice(0)
        .reverse()
        .map((resource) => resource.close())
    );
    const keys = await client.keys(`${prefix}:${name}:*`);
    if (keys.length) await client.del(...keys);
    await client.quit();
  });

  async function start(subscribe = true) {
    const factory = createQueueFactory({
      client,
      readOnly: false,
      queueOptions: {},
      onWarning: (message) => warnings.push(message),
      ...(subscribe ? { onFailed: (event: FailedJobEvent) => events.push(event) } : {}),
    });
    resources.push(factory);
    handle = factory.createQueue({ name, prefix, lib })!;
    resources.push(handle);
    // Let the actual Redis subscription finish before producing jobs.
    if (subscribe && lib === 'bullmq') {
      await until(async () =>
        ((await client.client('LIST')) as string).includes(
          `name=${prefix}:${Buffer.from(name).toString('base64')}:qe`
        )
      );
    } else if (subscribe) {
      await until(async () => {
        const subscribers = (await client.pubsub('NUMSUB', `${prefix}:${name}:failed`)) as [
          string,
          number,
        ];
        return subscribers[1] > 0;
      });
    }
    await new Promise((resolve) => setTimeout(resolve, 30));
  }

  async function producer() {
    if (lib === 'bullmq') {
      const queue = new Queue(name, { connection, prefix });
      resources.push(queue);
      const worker = new Worker(
        name,
        async (job) => {
          if (job.name === 'recovers' && job.attemptsMade > 0) return 'ok';
          throw new Error('final failure');
        },
        { connection, prefix }
      );
      resources.push(worker);
      return {
        add: (jobName: string, attempts: number, removeOnFail = false) =>
          queue.add(
            jobName,
            { private: 'not included' },
            { attempts, backoff: { type: 'fixed', delay: 30 }, removeOnFail }
          ),
      };
    }
    const queue = new Bull(name, { redis: connection, prefix });
    resources.push(queue);
    void queue.process('*', async (job) => {
      if (job.name === 'recovers' && job.attemptsMade > 0) return 'ok';
      throw new Error('final failure');
    });
    return {
      add: (jobName: string, attempts: number, removeOnFail = false) =>
        queue.add(
          jobName,
          { private: 'not included' },
          { attempts, backoff: { type: 'fixed', delay: 30 }, removeOnFail }
        ),
    };
  }

  it('alerts once after exhaustion and still alerts when removeOnFail removes the job', async () => {
    await start();
    const queue = await producer();
    const job = await queue.add('fails', 3, true);
    await until(() => events.length === 1);
    expect(events[0]).toMatchObject({
      queue: name,
      prefix,
      jobId: String(job.id),
      reason: 'final failure',
    });
    expect(JSON.stringify(events)).not.toContain('private');
    expect(await client.exists(`${prefix}:${name}:${job.id}`)).toBe(0);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(events).toHaveLength(1);
  });

  it('does not alert when a later retry succeeds', async () => {
    await start();
    const queue = await producer();
    const job = await queue.add('recovers', 3);
    await until(async () => (await job.getState()) === 'completed');
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(events).toEqual([]);
  });

  it('does not replay historical failures and detaches on queue removal', async () => {
    const queue = await producer();
    const old = await queue.add('old', 1);
    await until(async () => (await old.getState()) === 'failed');
    await start();
    expect(events).toEqual([]);
    await handle.close();
    const next = await queue.add('after-close', 1);
    await until(async () => (await next.getState()) === 'failed');
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(events).toEqual([]);
  });

  it('creates no notification subscriptions when disabled', async () => {
    await start(false);
    const queue = await producer();
    const job = await queue.add('fails', 1);
    await until(async () => (await job.getState()) === 'failed');
    expect(events).toEqual([]);
    expect(warnings).toEqual([]);
  });
});

describe.each([true, false])('running dashboard notifications (noRetry=%s)', (noRetry) => {
  it('sends terminal failures without browser requests and stops delivering after shutdown', async () => {
    const { resolveConfig } = await import('../src/config/resolve');
    const { run } = await import('../src/index');
    const name = `running-${Date.now()}`;
    const prefix = 'notification-run';
    const client = new Redis(connection);
    const queue = new Queue(name, { connection, prefix });
    await queue.waitUntilReady();
    const fetcher = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(null, { status: 204 }));
    const config = resolveConfig({
      flags: {},
      file: {},
      env: {
        BULL_BOARD_REDIS_URL: `redis://${connection.host}:${connection.port}`,
        BULL_BOARD_PREFIX: prefix,
        BULL_BOARD_QUEUES: name,
        BULL_BOARD_PORT: '0',
        BULL_BOARD_SCAN_INTERVAL: '0',
        BULL_BOARD_OPEN: 'false',
        BULL_BOARD_NO_RETRY: String(noRetry),
        BULL_BOARD_NOTIFICATIONS_ENABLED: 'true',
        BULL_BOARD_DISCORD_ENABLED: 'true',
        BULL_BOARD_DISCORD_WEBHOOK_URL: 'https://discord.com/api/webhooks/123/secret',
      },
    });
    let board: Awaited<ReturnType<typeof run>> | undefined;
    let worker: { close(): Promise<void> } | undefined;
    try {
      board = await run(config, { log: () => undefined, warn: () => undefined } as typeof console);
      await until(async () =>
        ((await client.client('LIST')) as string).includes(
          `name=${prefix}:${Buffer.from(name).toString('base64')}:qe`
        )
      );
      await new Promise((resolve) => setTimeout(resolve, 30));
      worker = new Worker(
        name,
        async () => {
          throw new Error('run failure');
        },
        { connection, prefix }
      );
      await queue.add('fail', {}, { attempts: 2 });
      await until(() => fetcher.mock.calls.length === 1);
      expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body)).content).toContain('run failure');
      await board.close();
      const job = await queue.add('after-close', {});
      await until(async () => (await job.getState()) === 'failed');
      expect(fetcher).toHaveBeenCalledTimes(1);
    } finally {
      await board?.close();
      await worker?.close();
      await queue.obliterate({ force: true });
      await queue.close();
      await client.quit();
      fetcher.mockRestore();
    }
  });
});
