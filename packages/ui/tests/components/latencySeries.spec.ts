import {
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

describe('toLatencyRows', () => {
  it('maps latency points into rows keyed by percentile', () => {
    const rows = toLatencyRows([{ ts: 100, count: 10, values: { '50': 5, '95': 20, '99': 40 } }]);

    expect(rows).toEqual([{ x: 100, count: 10, p50: 5, p95: 20, p99: 40 }]);
  });

  it('keeps a queue-age-only bucket instead of dropping it, leaving percentiles undefined', () => {
    const rows = toLatencyRows(
      [{ ts: 100, count: 3, values: { '50': 5, '95': 20, '99': 40 } }],
      [
        { ts: 100, value: 1000 },
        { ts: 200, value: 45000 },
      ]
    );

    expect(rows).toEqual([
      { x: 100, count: 3, p50: 5, p95: 20, p99: 40, queueAge: 1000 },
      { x: 200, queueAge: 45000 },
    ]);
  });

  it('sorts merged rows ascending by timestamp', () => {
    const rows = toLatencyRows(
      [
        { ts: 300, count: 1, values: { '50': 1, '95': 1, '99': 1 } },
        { ts: 100, count: 1, values: { '50': 2, '95': 2, '99': 2 } },
      ],
      [{ ts: 200, value: 5000 }]
    );

    expect(rows.map((row) => row.x)).toEqual([100, 200, 300]);
  });

  it('returns an empty array when there is no data at all', () => {
    expect(toLatencyRows([])).toEqual([]);
  });
});
