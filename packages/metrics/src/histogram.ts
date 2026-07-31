/**
 * Fixed bucket boundaries in milliseconds, roughly 2-3x steps. Fixed rather than
 * configurable because two ranges holding different layouts cannot be merged into one
 * percentile without layout versioning, and the merge is what makes multi-day queries work.
 *
 * The tail past 10 minutes exists for wait time, where a stalled queue genuinely sits for
 * hours. Without it p99 wait collapses to "over 10 minutes" exactly when it needs to be
 * actionable.
 */
export const BUCKET_BOUNDS = [
  10, 25, 50, 100, 250, 500, 1_000, 2_500, 5_000, 10_000, 30_000, 60_000, 300_000, 600_000,
  1_800_000, 3_600_000, 21_600_000,
];

/** One bucket per bound, plus a final overflow bucket for anything past the last bound. */
export const BUCKET_COUNT = BUCKET_BOUNDS.length + 1;

export function bucketIndex(ms: number): number {
  for (let i = 0; i < BUCKET_BOUNDS.length; i++) {
    if (ms <= BUCKET_BOUNDS[i]) {
      return i;
    }
  }
  return BUCKET_COUNT - 1;
}

export function emptyVector(): number[] {
  return new Array(BUCKET_COUNT).fill(0);
}

export function packVector(vector: number[]): string {
  return vector.join(',');
}

export function unpackVector(raw: string | null): number[] {
  const out = emptyVector();
  if (!raw) {
    return out;
  }
  const parts = raw.split(',');
  for (let i = 0; i < BUCKET_COUNT && i < parts.length; i++) {
    out[i] = Number(parts[i]) || 0;
  }
  return out;
}

export function mergeVectors(a: number[], b: number[]): number[] {
  const out = emptyVector();
  for (let i = 0; i < BUCKET_COUNT; i++) {
    out[i] = (a[i] ?? 0) + (b[i] ?? 0);
  }
  return out;
}

export function vectorTotal(vector: number[]): number {
  let total = 0;
  for (let i = 0; i < BUCKET_COUNT; i++) {
    total += vector[i] ?? 0;
  }
  return total;
}

/**
 * Prometheus-style histogram_quantile: find the bucket holding the rank, then interpolate
 * linearly across that bucket's span. The result is an estimate bounded by bucket width,
 * never more precise than the layout allows.
 *
 * Samples in the overflow bucket have no upper bound to interpolate towards, so they report
 * the last finite bound rather than inventing a ceiling.
 */
export function quantile(vector: number[], p: number): number {
  const total = vectorTotal(vector);
  if (total === 0) {
    return 0;
  }
  const target = (p / 100) * total;
  let cumulative = 0;
  for (let i = 0; i < BUCKET_COUNT; i++) {
    const count = vector[i] ?? 0;
    if (count === 0) {
      continue;
    }
    if (cumulative + count >= target) {
      if (i === BUCKET_COUNT - 1) {
        return BUCKET_BOUNDS[BUCKET_BOUNDS.length - 1];
      }
      const lower = i === 0 ? 0 : BUCKET_BOUNDS[i - 1];
      const upper = BUCKET_BOUNDS[i];
      const withinBucket = (target - cumulative) / count;
      return Math.round(lower + (upper - lower) * withinBucket);
    }
    cumulative += count;
  }
  return BUCKET_BOUNDS[BUCKET_BOUNDS.length - 1];
}
