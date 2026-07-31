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

  it('truncates a string holding more fields than the layout has buckets', () => {
    // A value written by a future, wider bucket layout must not widen the vector every
    // consumer here indexes by BUCKET_COUNT.
    const overlong = new Array(BUCKET_COUNT + 3).fill(1);
    const unpacked = unpackVector(overlong.join(','));

    expect(unpacked).toHaveLength(BUCKET_COUNT);
    expect(unpacked).toEqual(new Array(BUCKET_COUNT).fill(1));
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

  // Exact values, not just bucket containment: interpolating from the wrong end of the
  // bucket, or towards the wrong bound, still lands inside it and would pass unnoticed.
  it('interpolates linearly from the bucket floor towards its bound', () => {
    const v = emptyVector();
    v[2] = 100; // (25, 50]
    // rank 95 of 100 sits 95% of the way across a bucket spanning 25ms: 25 + 25 * 0.95.
    expect(quantile(v, 95)).toBe(49);
    expect(quantile(v, 50)).toBe(38); // 25 + 25 * 0.5, rounded
    expect(quantile(v, 10)).toBe(28); // 25 + 25 * 0.1, rounded
  });

  it('resolves a single sample to its own bucket', () => {
    const v = emptyVector();
    v[0] = 1;
    // One sample in (0, 10], so p99 lands 99% of the way across the bucket and rounds to
    // its bound, while the median lands halfway.
    expect(quantile(v, 99)).toBe(BUCKET_BOUNDS[0]);
    expect(quantile(v, 50)).toBe(5);
  });

  it('separates low and high percentiles on a spread distribution', () => {
    const v = emptyVector();
    v[1] = 90; // (10, 25]
    v[8] = 10; // (2500, 5000]
    // rank 50 falls in the first bucket, 50/90 of the way across (10, 25].
    expect(quantile(v, 50)).toBe(18);
    // rank 99 falls in the second, 9/10 of the way across (2500, 5000].
    expect(quantile(v, 99)).toBe(4750);
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
