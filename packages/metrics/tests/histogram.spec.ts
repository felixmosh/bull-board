import {
  BUCKET_BOUNDS,
  BUCKET_COUNT,
  bucketIndex,
  emptyVector,
  mergeVectors,
  packVector,
  quantile,
  unpackVector,
  vectorTotal,
} from '../src/histogram';

describe('bucketIndex', () => {
  it('puts a duration in the first bucket whose bound it does not exceed', () => {
    expect(bucketIndex(0)).toBe(0);
    expect(bucketIndex(10)).toBe(0);
    expect(bucketIndex(11)).toBe(1);
    expect(bucketIndex(25)).toBe(1);
    expect(bucketIndex(26)).toBe(2);
  });

  it('puts anything past the last bound in the overflow bucket', () => {
    const last = BUCKET_BOUNDS[BUCKET_BOUNDS.length - 1];
    expect(bucketIndex(last)).toBe(BUCKET_COUNT - 2);
    expect(bucketIndex(last + 1)).toBe(BUCKET_COUNT - 1);
    expect(bucketIndex(Number.MAX_SAFE_INTEGER)).toBe(BUCKET_COUNT - 1);
  });

  it('clamps negative durations to the first bucket', () => {
    expect(bucketIndex(-5)).toBe(0);
  });
});

describe('packVector / unpackVector', () => {
  it('round trips', () => {
    const v = emptyVector();
    v[0] = 3;
    v[5] = 120;
    v[BUCKET_COUNT - 1] = 7;
    expect(unpackVector(packVector(v))).toEqual(v);
  });

  it('treats a missing value as an empty vector', () => {
    expect(unpackVector(null)).toEqual(emptyVector());
  });

  it('pads a short or malformed string up to the full width', () => {
    expect(unpackVector('1,2')).toEqual([1, 2, ...emptyVector().slice(2)]);
  });
});

describe('mergeVectors', () => {
  it('adds elementwise without mutating its inputs', () => {
    const a = emptyVector();
    const b = emptyVector();
    a[1] = 2;
    b[1] = 5;
    b[3] = 1;
    const merged = mergeVectors(a, b);
    expect(merged[1]).toBe(7);
    expect(merged[3]).toBe(1);
    expect(a[1]).toBe(2);
    expect(b[1]).toBe(5);
  });
});

describe('quantile', () => {
  it('returns 0 for an empty histogram', () => {
    expect(quantile(emptyVector(), 95)).toBe(0);
  });

  it('returns a value inside the containing bucket when all samples share one bucket', () => {
    const v = emptyVector();
    v[2] = 100; // (25, 50]
    const p95 = quantile(v, 95);
    expect(p95).toBeGreaterThan(25);
    expect(p95).toBeLessThanOrEqual(50);
  });

  it('resolves a single sample to its own bucket', () => {
    const v = emptyVector();
    v[0] = 1;
    expect(quantile(v, 99)).toBeGreaterThan(0);
    expect(quantile(v, 99)).toBeLessThanOrEqual(BUCKET_BOUNDS[0]);
  });

  it('separates low and high percentiles on a spread distribution', () => {
    const v = emptyVector();
    v[1] = 90; // (10, 25]
    v[8] = 10; // (2500, 5000]
    expect(quantile(v, 50)).toBeLessThanOrEqual(25);
    expect(quantile(v, 99)).toBeGreaterThan(2500);
  });

  it('reports the last finite bound for samples in the overflow bucket', () => {
    const v = emptyVector();
    v[BUCKET_COUNT - 1] = 5;
    expect(quantile(v, 95)).toBe(BUCKET_BOUNDS[BUCKET_BOUNDS.length - 1]);
  });
});

describe('vectorTotal', () => {
  it('sums every bucket', () => {
    const v = emptyVector();
    v[0] = 2;
    v[7] = 3;
    expect(vectorTotal(v)).toBe(5);
  });
});
