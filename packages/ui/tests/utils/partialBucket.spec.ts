import { isPartialBucket, withPartialTail } from '../../src/utils/partialBucket';

describe('isPartialBucket', () => {
  // Fixed instant: 2026-07-27T14:32:10.000Z. Chosen mid-day/mid-hour so day and hour
  // start/end boundaries are unambiguous.
  const now = Date.UTC(2026, 6, 27, 14, 32, 10);
  const todayStart = Date.UTC(2026, 6, 27, 0, 0, 0);
  const yesterdayStart = Date.UTC(2026, 6, 26, 0, 0, 0);
  const currentHourStart = Date.UTC(2026, 6, 27, 14, 0, 0);
  const previousHourStart = Date.UTC(2026, 6, 27, 13, 0, 0);

  it('marks the current day as partial at day granularity', () => {
    expect(isPartialBucket(todayStart, 'day', now)).toBe(true);
  });

  it('does not mark yesterday as partial at day granularity', () => {
    expect(isPartialBucket(yesterdayStart, 'day', now)).toBe(false);
  });

  it('marks the current hour as partial at hour granularity', () => {
    expect(isPartialBucket(currentHourStart, 'hour', now)).toBe(true);
  });

  it('does not mark the previous hour as partial at hour granularity', () => {
    expect(isPartialBucket(previousHourStart, 'hour', now)).toBe(false);
  });

  it('never marks a range-granularity point as partial', () => {
    expect(isPartialBucket(now, 'range', now)).toBe(false);
    expect(isPartialBucket(todayStart, 'range', now)).toBe(false);
  });
});

describe('withPartialTail', () => {
  interface Row {
    x: number;
    a?: number;
    aTail?: number;
    b?: number;
    bTail?: number;
  }

  const rows: Row[] = [
    { x: 1, a: 10, b: 100 },
    { x: 2, a: 20, b: 200 },
    { x: 3, a: 30, b: 300 },
  ];

  it('returns the rows unchanged when the last bucket is not partial', () => {
    const result = withPartialTail(rows, ['a', 'b'], false);
    expect(result).toEqual(rows);
  });

  it('returns the rows unchanged with fewer than two points', () => {
    const result = withPartialTail(rows.slice(0, 1), ['a', 'b'], true);
    expect(result).toEqual(rows.slice(0, 1));
  });

  it('moves the last row values into Tail fields and mirrors the prior point', () => {
    const result = withPartialTail(rows, ['a', 'b'], true);

    expect(result[0]).toEqual(rows[0]);
    expect(result[1]).toEqual({ x: 2, a: 20, b: 200, aTail: 20, bTail: 200 });
    expect(result[2]).toEqual({ x: 3, a: undefined, b: undefined, aTail: 30, bTail: 300 });
  });

  it('does not mutate the input rows', () => {
    const original = JSON.parse(JSON.stringify(rows));
    withPartialTail(rows, ['a', 'b'], true);
    expect(rows).toEqual(original);
  });
});
