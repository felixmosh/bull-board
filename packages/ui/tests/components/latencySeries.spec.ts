import {
  clampLatencyRowsToLogFloor,
  clampToLogFloor,
  computeLatencyAxisDomain,
  computeLogTicks,
  confidenceOpacity,
  formatDuration,
  toLatencyRows,
} from '../../src/components/LatencyChart/latencySeries';

describe('formatDuration', () => {
  it('renders sub-second durations in whole milliseconds', () => {
    expect(formatDuration(75)).toBe('75ms');
    expect(formatDuration(0)).toBe('0ms');
    expect(formatDuration(999)).toBe('999ms');
  });

  it('renders sub-minute durations in seconds, dropping a trailing .0', () => {
    expect(formatDuration(4750)).toBe('4.8s');
    expect(formatDuration(5000)).toBe('5s');
    expect(formatDuration(1000)).toBe('1s');
    expect(formatDuration(59000)).toBe('59s');
  });

  it('renders minute-scale durations as minutes and seconds', () => {
    expect(formatDuration(90000)).toBe('1m 30s');
    expect(formatDuration(60000)).toBe('1m');
    expect(formatDuration(3599000)).toBe('59m 59s');
  });

  it('renders hour-scale durations as hours and minutes', () => {
    expect(formatDuration(3600000)).toBe('1h');
    expect(formatDuration(3661000)).toBe('1h 1m');
  });

  it('falls back to 0ms for non-finite input', () => {
    expect(formatDuration(NaN)).toBe('0ms');
    expect(formatDuration(Infinity)).toBe('0ms');
  });
});

describe('confidenceOpacity', () => {
  it('is dim for zero or negative samples', () => {
    expect(confidenceOpacity(0)).toBeCloseTo(0.3);
    expect(confidenceOpacity(-5)).toBeCloseTo(0.3);
  });

  it('tapers up towards full opacity as samples increase', () => {
    const low = confidenceOpacity(2);
    const high = confidenceOpacity(10);
    expect(low).toBeLessThan(high);
    expect(high).toBeLessThan(1);
  });

  it('is fully opaque once the confident sample count is reached', () => {
    expect(confidenceOpacity(20)).toBe(1);
    expect(confidenceOpacity(1000)).toBe(1);
  });
});

// Field names carry the metric now (runP50/waitP50/...) instead of a bare p50/p95/p99, because
// a row can hold both metrics' percentiles at once: the chart merged from one series per metric
// into one series per (metric, percentile) pair.
describe('toLatencyRows', () => {
  it('maps run-time points into rows keyed by metric and percentile', () => {
    const rows = toLatencyRows([{ ts: 100, count: 10, values: { '50': 5, '95': 20, '99': 40 } }]);

    expect(rows).toEqual([{ x: 100, runCount: 10, runP50: 5, runP95: 20, runP99: 40 }]);
  });

  it('merges run-time and wait-time points sharing a timestamp into one row', () => {
    const rows = toLatencyRows(
      [{ ts: 100, count: 10, values: { '50': 5, '95': 20, '99': 40 } }],
      [{ ts: 100, count: 6, values: { '50': 15, '95': 60, '99': 120 } }]
    );

    expect(rows).toEqual([
      {
        x: 100,
        runCount: 10,
        runP50: 5,
        runP95: 20,
        runP99: 40,
        waitCount: 6,
        waitP50: 15,
        waitP95: 60,
        waitP99: 120,
      },
    ]);
  });

  it('keeps a queue-age-only bucket instead of dropping it, leaving percentiles undefined', () => {
    const rows = toLatencyRows(
      [{ ts: 100, count: 3, values: { '50': 5, '95': 20, '99': 40 } }],
      [],
      [
        { ts: 100, value: 1000 },
        { ts: 200, value: 45000 },
      ]
    );

    expect(rows).toEqual([
      { x: 100, runCount: 3, runP50: 5, runP95: 20, runP99: 40, queueAge: 1000 },
      { x: 200, queueAge: 45000 },
    ]);
  });

  it('keeps a wait-only bucket that has no run-time completion in the same window', () => {
    const rows = toLatencyRows(
      [{ ts: 100, count: 3, values: { '50': 5, '95': 20, '99': 40 } }],
      [{ ts: 200, count: 2, values: { '50': 8, '95': 30, '99': 50 } }]
    );

    expect(rows).toEqual([
      { x: 100, runCount: 3, runP50: 5, runP95: 20, runP99: 40 },
      { x: 200, waitCount: 2, waitP50: 8, waitP95: 30, waitP99: 50 },
    ]);
  });

  it('sorts merged rows ascending by timestamp', () => {
    const rows = toLatencyRows(
      [
        { ts: 300, count: 1, values: { '50': 1, '95': 1, '99': 1 } },
        { ts: 100, count: 1, values: { '50': 2, '95': 2, '99': 2 } },
      ],
      [{ ts: 200, count: 1, values: { '50': 3, '95': 3, '99': 3 } }]
    );

    expect(rows.map((row) => row.x)).toEqual([100, 200, 300]);
  });

  it('returns an empty array when there is no data at all', () => {
    expect(toLatencyRows([])).toEqual([]);
  });
});

describe('clampToLogFloor', () => {
  it('clamps values below the floor up to it', () => {
    expect(clampToLogFloor(0)).toBe(1);
    expect(clampToLogFloor(0.4)).toBe(1);
    expect(clampToLogFloor(-5)).toBe(1);
  });

  it('leaves values at or above the floor unchanged', () => {
    expect(clampToLogFloor(1)).toBe(1);
    expect(clampToLogFloor(5000)).toBe(5000);
  });

  it('respects a custom floor', () => {
    expect(clampToLogFloor(50, 100)).toBe(100);
    expect(clampToLogFloor(150, 100)).toBe(150);
  });

  it('passes undefined and non-finite values through unchanged, never fabricating a point', () => {
    expect(clampToLogFloor(undefined)).toBeUndefined();
    expect(clampToLogFloor(NaN)).toBeNaN();
    expect(clampToLogFloor(Infinity)).toBe(Infinity);
  });
});

describe('clampLatencyRowsToLogFloor', () => {
  it('floors every duration field on every row without dropping any point', () => {
    const rows = clampLatencyRowsToLogFloor([
      { x: 100, runP50: 0, runP95: 0.5, runP99: 5000, waitP50: 0, queueAge: 0 },
    ]);

    expect(rows).toEqual([
      {
        x: 100,
        runP50: 1,
        runP95: 1,
        runP99: 5000,
        runCount: undefined,
        waitCount: undefined,
        waitP50: 1,
        waitP95: undefined,
        waitP99: undefined,
        queueAge: 1,
      },
    ]);
  });

  it('leaves undefined fields undefined', () => {
    const rows = clampLatencyRowsToLogFloor([{ x: 100, runP50: 0 }]);
    expect(rows).toEqual([
      {
        x: 100,
        runP50: 1,
        runP95: undefined,
        runP99: undefined,
        runCount: undefined,
        waitCount: undefined,
        waitP50: undefined,
        waitP95: undefined,
        waitP99: undefined,
        queueAge: undefined,
      },
    ]);
  });
});

describe('computeLatencyAxisDomain', () => {
  it('falls back to linear when every point is zero', () => {
    const rows = [
      { x: 100, runP50: 0, runP95: 0, runP99: 0 },
      { x: 200, runP50: 0, runP95: 0, runP99: 0 },
    ];
    expect(computeLatencyAxisDomain(rows)).toEqual({ scale: 'linear', domain: [0, 'dataMax'] });
  });

  it('falls back to linear when there is only one distinct value', () => {
    const rows = [
      { x: 100, runP50: 500 },
      { x: 200, runP50: 500 },
    ];
    expect(computeLatencyAxisDomain(rows)).toEqual({ scale: 'linear', domain: [0, 'dataMax'] });
  });

  it('falls back to linear when there is no numeric data at all', () => {
    expect(computeLatencyAxisDomain([])).toEqual({ scale: 'linear', domain: [0, 'dataMax'] });
    expect(computeLatencyAxisDomain([{ x: 100 }])).toEqual({
      scale: 'linear',
      domain: [0, 'dataMax'],
    });
  });

  it('picks a log domain spanning the actual data for a normal spread', () => {
    const rows = [{ x: 100, runP50: 300, runP95: 1500, runP99: 139000 }];
    expect(computeLatencyAxisDomain(rows)).toEqual({ scale: 'log', domain: [300, 139000] });
  });

  it('spans both metrics when both are included in the default key set', () => {
    const rows = [{ x: 100, runP50: 300, waitP99: 139000 }];
    expect(computeLatencyAxisDomain(rows)).toEqual({ scale: 'log', domain: [300, 139000] });
  });

  it('restricts the domain to only the enabled keys passed in', () => {
    const rows = [{ x: 100, runP50: 300, runP99: 5000, waitP99: 139000 }];
    expect(computeLatencyAxisDomain(rows, ['runP50', 'runP99'])).toEqual({
      scale: 'log',
      domain: [300, 5000],
    });
  });

  it('clamps a value below the floor before it can pull the domain down to zero', () => {
    const rows = [{ x: 100, runP50: 0, runP95: 20, runP99: 200 }];
    expect(computeLatencyAxisDomain(rows)).toEqual({ scale: 'log', domain: [1, 200] });
  });

  it('spreads a domain across single-digit milliseconds instead of anchoring to a wide floor', () => {
    const rows = [{ x: 100, runP50: 2, runP95: 5, runP99: 8 }];
    expect(computeLatencyAxisDomain(rows)).toEqual({ scale: 'log', domain: [2, 8] });
  });
});

describe('computeLogTicks', () => {
  it('returns an empty array for a degenerate range', () => {
    expect(computeLogTicks(0, 100)).toEqual([]);
    expect(computeLogTicks(100, 100)).toEqual([]);
    expect(computeLogTicks(100, 50)).toEqual([]);
  });

  it('picks round duration values within the range', () => {
    expect(computeLogTicks(100, 3000)).toEqual([100, 200, 500, 1000, 2000]);
  });

  it('thins a wide range down to a readable count of ticks', () => {
    const ticks = computeLogTicks(1, 2000);
    expect(ticks.length).toBeLessThanOrEqual(6);
    expect(ticks).toEqual([1, 5, 20, 100, 500, 2000]);
  });

  it('reads as human durations via the existing formatter', () => {
    const ticks = computeLogTicks(1, 130000);
    expect(ticks.map(formatDuration)).toEqual(['1ms', '10ms', '100ms', '2s', '20s', '2m']);
  });

  it('falls back to the domain endpoints when the range holds no ladder value', () => {
    expect(computeLogTicks(3, 4)).toEqual([3, 4]);
  });
});
