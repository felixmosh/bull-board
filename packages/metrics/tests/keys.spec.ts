import {
  DEFAULT_NAMESPACE,
  GLOBAL_QUEUE,
  dayRange,
  dayToStartMs,
  metricsKeys,
  minuteToDay,
  resolveNamespace,
} from '../src/keys';

const testKeys = metricsKeys(DEFAULT_NAMESPACE);

describe('keys', () => {
  it('derives the UTC day from a minute index', () => {
    expect(minuteToDay(1609459200000 / 60000)).toBe('2021-01-01');
    // one minute before midnight is still the previous day.
    expect(minuteToDay(1609459200000 / 60000 - 1)).toBe('2020-12-31');
  });

  it('builds namespaced keys', () => {
    expect(testKeys.day('MyQueue', 'completed', '2021-01-01')).toBe(
      `${DEFAULT_NAMESPACE}:MyQueue:completed:2021-01-01`
    );
    expect(testKeys.totals(GLOBAL_QUEUE, 'failed')).toBe(
      `${DEFAULT_NAMESPACE}:__global__:failed:totals`
    );
  });

  it('builds every key off the namespace it was given', () => {
    const scoped = metricsKeys('{tenant-a}');
    expect(scoped.day('Q', 'completed', '2021-01-01')).toBe('{tenant-a}:Q:completed:2021-01-01');
    expect(scoped.hour('Q', 'completed', '2021-01-01')).toBe(
      '{tenant-a}:Q:completed:hour:2021-01-01'
    );
    expect(scoped.totals('Q', 'completed')).toBe('{tenant-a}:Q:completed:totals');
    expect(scoped.lease('Q')).toBe('{tenant-a}:Q:latency:lease');
    expect(scoped.watermark('Q')).toBe('{tenant-a}:Q:latency:watermark');
    expect(scoped.scanPattern).toBe('{tenant-a}:*');
  });

  it('lists inclusive UTC day range', () => {
    const from = Date.UTC(2021, 0, 1, 23, 0, 0);
    const to = Date.UTC(2021, 0, 3, 1, 0, 0);
    expect(dayRange(from, to)).toEqual(['2021-01-01', '2021-01-02', '2021-01-03']);
  });

  it('returns an empty array for an inverted range (from after to)', () => {
    const from = Date.UTC(2021, 0, 5);
    const to = Date.UTC(2021, 0, 1);
    expect(dayRange(from, to)).toEqual([]);
  });

  it('spans a year boundary', () => {
    const from = Date.UTC(2021, 11, 31, 23, 0);
    const to = Date.UTC(2022, 0, 1, 1, 0);
    expect(dayRange(from, to)).toEqual(['2021-12-31', '2022-01-01']);
  });

  it('round-trips day to UTC midnight ms', () => {
    expect(dayToStartMs('2021-01-01')).toBe(Date.UTC(2021, 0, 1));
  });
});

describe('resolveNamespace', () => {
  it('leaves a standalone namespace exactly as it was', () => {
    expect(resolveNamespace(undefined, false)).toBe(DEFAULT_NAMESPACE);
    expect(resolveNamespace('staging:metrics', false)).toBe('staging:metrics');
  });

  it('hash-tags a clustered namespace so one EVAL cannot cross a slot', () => {
    expect(resolveNamespace(undefined, true)).toBe(`{${DEFAULT_NAMESPACE}}`);
    expect(resolveNamespace('staging:metrics', true)).toBe('{staging:metrics}');
  });

  it("keeps the caller's own hash tag, so they choose the slot", () => {
    expect(resolveNamespace('{tenant-a}:metrics', true)).toBe('{tenant-a}:metrics');
    expect(resolveNamespace('metrics:{tenant-a}', true)).toBe('metrics:{tenant-a}');
  });

  it('wraps a prefix whose braces Redis would not read as a tag', () => {
    expect(resolveNamespace('metrics:{}', true)).toBe('{metrics:{}}');
    expect(resolveNamespace('me{trics', true)).toBe('{me{trics}');
  });

  it('tolerates a trailing colon, which is how the namespace is usually written', () => {
    expect(resolveNamespace('staging:metrics:', false)).toBe('staging:metrics');
    expect(resolveNamespace('', false)).toBe(DEFAULT_NAMESPACE);
  });
});
