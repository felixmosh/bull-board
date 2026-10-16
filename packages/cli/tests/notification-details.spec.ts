import { FailureEnricher } from '../src/notifications/details';
import type { FailedJobEvent } from '../src/notifications/format';
const event: FailedJobEvent = {
  queue: 'emails',
  prefix: 'bull',
  jobId: '1',
  reason: 'failed',
  timestamp: 0,
};
const job = {
  name: 'deliver',
  attemptsMade: 3,
  opts: { attempts: 3, secret: 'private-options' },
  processedOn: 100,
  finishedOn: 250,
  data: { private: 'private-data' },
};

test('enriches only allowed retained-job metadata', async () => {
  const enricher = new FailureEnricher();
  const result = await new Promise<FailedJobEvent>((resolve) =>
    enricher.notify(event, async () => job, resolve)
  );
  expect(result).toEqual({
    ...event,
    jobName: 'deliver',
    attemptsMade: 3,
    maxAttempts: 3,
    durationMs: 150,
  });
  expect(JSON.stringify(result)).not.toContain('private');
  enricher.close();
});

test.each([null, undefined, new Error('secret')])(
  'falls back when job is missing or lookup fails',
  async (result) => {
    const enricher = new FailureEnricher();
    const next = await new Promise<FailedJobEvent>((resolve) =>
      enricher.notify(
        event,
        async () => {
          if (result instanceof Error) throw result;
          return result;
        },
        resolve
      )
    );
    expect(next).toEqual(event);
    enricher.close();
  }
);

test('bounds concurrent reads even after timeout, and emits each event just once', async () => {
  const enricher = new FailureEnricher(2, 20);
  const events: FailedJobEvent[] = [];
  let reads = 0;
  const pending: ((value: typeof job) => void)[] = [];
  const read = () => {
    reads++;
    return new Promise<typeof job>((resolve) => pending.push(resolve));
  };
  for (let i = 0; i < 100; i++)
    enricher.notify({ ...event, jobId: String(i) }, read, (e) => events.push(e));
  expect(reads).toBe(2);
  expect(events).toHaveLength(98);
  await new Promise((r) => setTimeout(r, 40));
  expect(events).toHaveLength(100);
  enricher.notify(event, read, (e) => events.push(e));
  expect(reads).toBe(2);
  pending.forEach((resolve) => resolve(job));
  await new Promise((r) => setImmediate(r));
  expect(events).toHaveLength(101);
  enricher.close();
});

test('suppresses pending lookup callbacks after shutdown', async () => {
  const enricher = new FailureEnricher(1, 20);
  let done!: (value: typeof job) => void;
  const emit = jest.fn();
  enricher.notify(
    event,
    () =>
      new Promise((resolve) => {
        done = resolve;
      }),
    emit
  );
  enricher.close();
  done(job);
  await new Promise((r) => setTimeout(r, 40));
  expect(emit).not.toHaveBeenCalled();
});
