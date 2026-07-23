import { canRetryFailedJobs, retriableFailedJobs } from '../../src/utils/failedRetries';
import { makeQueueWithFailed as withFailed } from '../testUtils';

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
