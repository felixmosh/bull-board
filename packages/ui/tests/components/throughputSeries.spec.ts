import {
  NATIVE_WINDOW,
  sum,
  toHistoryRows,
  toNativeRows,
  toNativeSeries,
} from '../../src/components/ThroughputAreaChart/throughputSeries';

describe('toNativeSeries', () => {
  it('returns 60 zeros when metrics is null', () => {
    const series = toNativeSeries(null, 120000);

    expect(series).toHaveLength(NATIVE_WINDOW);
    expect(series).toEqual(Array.from({ length: NATIVE_WINDOW }, () => 0));
  });

  it('returns 60 zeros when metrics is undefined', () => {
    expect(toNativeSeries(undefined, 120000)).toEqual(
      Array.from({ length: NATIVE_WINDOW }, () => 0)
    );
  });

  it('places live + historical data into the correct newest-last buckets', () => {
    const nowMs = 120000; // aligned to a minute boundary
    const metrics = {
      meta: { count: 15, prevTS: nowMs, prevCount: 10 },
      data: [7, 3],
      count: 15,
    };

    const series = toNativeSeries(metrics, nowMs);

    const expected = Array.from({ length: NATIVE_WINDOW }, () => 0);
    // live = count - prevCount = 5, newest bucket
    expected[NATIVE_WINDOW - 1] = 5;
    // data[0] = 7, one minute older
    expected[NATIVE_WINDOW - 2] = 7;
    // data[1] = 3, two minutes older
    expected[NATIVE_WINDOW - 3] = 3;

    expect(series).toEqual(expected);
  });

  it('shifts buckets back when prevTS is idle (older than now)', () => {
    const nowMs = 180000; // minute 3
    const metrics = {
      meta: { count: 4, prevTS: 120000, prevCount: 4 }, // minute 2, idle => live = 0
      data: [9],
      count: 4,
    };

    const series = toNativeSeries(metrics, nowMs);

    const expected = Array.from({ length: NATIVE_WINDOW }, () => 0);
    // idleMinutes = floor(180000/60000) - floor(120000/60000) = 3 - 2 = 1
    // live (j=0) lands at minutesAgo=1 -> series[58]
    expected[NATIVE_WINDOW - 2] = 0;
    // data[0]=9 (j=1) lands at minutesAgo=2 -> series[57]
    expected[NATIVE_WINDOW - 3] = 9;

    expect(series).toEqual(expected);
  });
});

describe('toNativeRows', () => {
  it('zips completed and failed arrays by index, defaulting missing failed to 0', () => {
    const rows = toNativeRows([1, 2, 3], [4, 5]);

    expect(rows).toEqual([
      { x: 0, completed: 1, failed: 4 },
      { x: 1, completed: 2, failed: 5 },
      { x: 2, completed: 3, failed: 0 },
    ]);
  });

  it('returns an empty array for empty input', () => {
    expect(toNativeRows([], [])).toEqual([]);
  });
});

describe('toHistoryRows', () => {
  it('merges by ts, fills missing completed/failed with 0, and sorts ascending', () => {
    const completed = [
      { ts: 200, value: 5 },
      { ts: 100, value: 2 },
    ];
    const failed = [
      { ts: 100, value: 1 },
      { ts: 300, value: 9 },
    ];

    const rows = toHistoryRows(completed, failed);

    expect(rows).toEqual([
      { x: 100, completed: 2, failed: 1 },
      { x: 200, completed: 5, failed: 0 },
      { x: 300, completed: 0, failed: 9 },
    ]);
  });

  it('returns an empty array when both inputs are empty', () => {
    expect(toHistoryRows([], [])).toEqual([]);
  });
});

describe('sum', () => {
  it('sums an array of numbers', () => {
    expect(sum([1, 2, 3])).toBe(6);
  });

  it('returns 0 for an empty array', () => {
    expect(sum([])).toBe(0);
  });
});
