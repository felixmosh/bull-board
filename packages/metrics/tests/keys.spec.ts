import {
  GLOBAL_QUEUE,
  NAMESPACE,
  dayHashKey,
  dayRange,
  dayToStartMs,
  minuteToDay,
  totalsHashKey,
} from '../src/keys';

describe('keys', () => {
  it('derives the UTC day from a minute index', () => {
    expect(minuteToDay(1609459200000 / 60000)).toBe('2021-01-01');
    // one minute before midnight is still the previous day.
    expect(minuteToDay(1609459200000 / 60000 - 1)).toBe('2020-12-31');
  });

  it('builds namespaced keys', () => {
    expect(dayHashKey('MyQueue', 'completed', '2021-01-01')).toBe(
      `${NAMESPACE}:MyQueue:completed:2021-01-01`
    );
    expect(totalsHashKey(GLOBAL_QUEUE, 'failed')).toBe(`${NAMESPACE}:__global__:failed:totals`);
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
