import type { AppJobScheduler } from '@bull-board/api/typings/app';
import { describeSchedule, formatInterval } from '../../src/pages/SchedulersPage/schedule';

// The page renders translation keys in tests, so the interpolated values are what matters.
const t = ((key: string, options?: Record<string, unknown>) =>
  options ? `${key}(${JSON.stringify(options)})` : key) as any;

const scheduler = (overrides: Partial<AppJobScheduler>): AppJobScheduler => ({
  id: 'sched',
  queueName: 'queue',
  name: 'task',
  ...overrides,
});

describe('formatInterval', () => {
  it('uses the largest unit the interval divides into evenly', () => {
    expect(formatInterval(2 * 24 * 60 * 60 * 1000, t)).toContain('SCHEDULERS.INTERVAL.DAYS');
    expect(formatInterval(3 * 60 * 60 * 1000, t)).toContain('SCHEDULERS.INTERVAL.HOURS');
    expect(formatInterval(15 * 60 * 1000, t)).toContain('SCHEDULERS.INTERVAL.MINUTES');
    expect(formatInterval(30 * 1000, t)).toContain('SCHEDULERS.INTERVAL.SECONDS');
    expect(formatInterval(250, t)).toContain('SCHEDULERS.INTERVAL.MILLISECONDS');
  });

  it('keeps the smaller unit rather than rounding an uneven interval', () => {
    // 90 minutes is not a whole number of hours, so it stays in minutes.
    expect(formatInterval(90 * 60 * 1000, t)).toBe('SCHEDULERS.INTERVAL.MINUTES({"count":90})');
    expect(formatInterval(1500, t)).toBe('SCHEDULERS.INTERVAL.MILLISECONDS({"count":1500})');
  });

  it('counts in the chosen unit', () => {
    expect(formatInterval(60 * 60 * 1000, t)).toBe('SCHEDULERS.INTERVAL.HOURS({"count":1})');
  });
});

describe('describeSchedule', () => {
  it('shows a cron pattern as written', () => {
    expect(describeSchedule(scheduler({ pattern: '0 3 * * *' }), t)).toBe('0 3 * * *');
  });

  it('describes an interval as a duration', () => {
    expect(describeSchedule(scheduler({ every: 5000 }), t)).toBe(
      'SCHEDULERS.EVERY({"interval":"SCHEDULERS.INTERVAL.SECONDS({\\"count\\":5})"})'
    );
  });

  it('falls back when a scheduler has neither', () => {
    expect(describeSchedule(scheduler({}), t)).toBe('-');
  });
});
