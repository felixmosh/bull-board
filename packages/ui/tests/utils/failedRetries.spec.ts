import type { AppQueue } from '@bull-board/api/typings/app';
import { canRetryFailedJobs, retriableFailedJobs } from '../../src/utils/failedRetries';

function makeQueue(name: string, overrides: Partial<AppQueue> = {}): AppQueue {
  return {
    delimiter: '.',
    name,
    counts: {
      active: 0,
      completed: 0,
      delayed: 0,
      failed: 0,
      paused: 0,
      prioritized: 0,
      waiting: 0,
      'waiting-children': 0,
      latest: 0,
    },
    jobs: [],
    statuses: ['waiting', 'completed', 'failed'],
    pagination: { pageCount: 1, range: { start: 0, end: 9 } },
    readOnlyMode: false,
    allowRetries: true,
    allowCompletedRetries: true,
    isPaused: false,
    type: 'bullmq',
    globalConcurrency: null,
    ...overrides,
  };
}

const withFailed = (name: string, failed: number, overrides: Partial<AppQueue> = {}) =>
  makeQueue(name, { ...overrides, counts: { ...makeQueue(name).counts, failed } });

it('allows retrying a writable queue that has failed jobs', () => {
  expect(canRetryFailedJobs(withFailed('Q1', 3))).toBe(true);
});

it('refuses a queue with no failed jobs', () => {
  expect(canRetryFailedJobs(withFailed('Q1', 0))).toBe(false);
});

it('refuses a read-only queue', () => {
  expect(canRetryFailedJobs(withFailed('Q1', 3, { readOnlyMode: true }))).toBe(false);
});

it('refuses a queue whose adapter disallows retries', () => {
  expect(canRetryFailedJobs(withFailed('Q1', 3, { allowRetries: false }))).toBe(false);
});

it('keeps only the retriable queues, in order, and totals their failed jobs', () => {
  const queues = [
    withFailed('empty', 0),
    withFailed('readonly', 5, { readOnlyMode: true }),
    withFailed('Q1', 2),
    withFailed('no-retries', 5, { allowRetries: false }),
    withFailed('Q2', 1),
  ];

  expect(retriableFailedJobs(queues)).toEqual({ queueNames: ['Q1', 'Q2'], jobCount: 3 });
});

it('reports nothing to retry when every queue is skipped', () => {
  const queues = [withFailed('empty', 0), withFailed('readonly', 5, { readOnlyMode: true })];

  expect(retriableFailedJobs(queues)).toEqual({ queueNames: [], jobCount: 0 });
});
