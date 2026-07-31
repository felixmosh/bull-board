const MS_PER_HOUR = 3600000;
const MS_PER_DAY = 86400000;

/** Granularities a history/latency bucket can be plotted at. `range` covers a whole queried
 *  span in a single point (see the by-queue table's p95 column) rather than a calendar bucket. */
export type BucketGranularity = 'hour' | 'day' | 'range';

/**
 * True when the bucket starting at `ts` covers a period that has not fully elapsed yet, e.g.
 * today's daily bucket or the current hour's hourly bucket. History is recorded per calendar
 * bucket, UTC-aligned (see RedisMetricsHistoryProvider's `dayFloor`/`dayToStartMs`), so a
 * bucket for "today" only reflects however many hours have elapsed so far. Plotted next to
 * complete prior buckets it reads as a cliff rather than a still-forming data point.
 *
 * `range` is never partial: it is exactly as complete as the query itself, not a calendar
 * period that keeps accumulating.
 */
export function isPartialBucket(
  ts: number,
  granularity: BucketGranularity,
  now: number = Date.now()
): boolean {
  if (granularity === 'range') {
    return false;
  }
  const bucketMs = granularity === 'hour' ? MS_PER_HOUR : MS_PER_DAY;
  return Math.floor(ts / bucketMs) === Math.floor(now / bucketMs);
}

/**
 * Returns a shallow copy of `rows` with the closing segment split so a chart can draw it
 * dashed without mutating the source data. For every key in `keys`, the last row's value moves
 * to `${key}Tail`, and the second-to-last row keeps its original value *and* gains a matching
 * `${key}Tail`. A solid `<Line>`/`<Area>` on `key` then stops one point short of the partial
 * bucket, while a second dashed one on `${key}Tail` draws exactly the connecting segment.
 *
 * A no-op (returns a copy of the input) unless there are at least two rows and the caller has
 * already determined the last one is partial -- callers derive that with `isPartialBucket`.
 */
export function withPartialTail<Row extends { x: number }>(
  rows: readonly Row[],
  keys: readonly (keyof Row & string)[],
  isLastPartial: boolean
): Row[] {
  if (!isLastPartial || rows.length < 2) {
    return [...rows];
  }

  const lastIndex = rows.length - 1;
  return rows.map((row, i) => {
    if (i < lastIndex - 1) {
      return row;
    }

    const next = { ...row } as Record<string, number | undefined>;
    const source = row as Record<string, number | undefined>;
    for (const key of keys) {
      next[`${key}Tail`] = source[key];
    }
    if (i === lastIndex) {
      for (const key of keys) {
        next[key] = undefined;
      }
    }
    return next as Row;
  });
}
