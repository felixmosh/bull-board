import { useMemo } from 'react';

const DAY_MS = 24 * 60 * 60 * 1000;

export function useRangeWindow(rangeKey: string, days: number): { from: number; to: number } {
  return useMemo(() => {
    const now = Date.now();
    return { from: now - days * DAY_MS, to: now };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rangeKey]);
}
