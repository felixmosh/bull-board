import type { QueueMetrics } from '@bull-board/api/typings/app';
import { metricsToMinutePoints } from '../src/dataMapping';

function metrics(prevTS: number, data: number[]): QueueMetrics {
  return { meta: { count: 0, prevTS, prevCount: 0 }, data, count: data.length };
}

describe('metricsToMinutePoints', () => {
  it('returns [] for null/empty', () => {
    expect(metricsToMinutePoints(null)).toEqual([]);
    expect(metricsToMinutePoints(metrics(600000, []))).toEqual([]);
  });

  it('maps data[i] to minute floor(prevTS/60000) - 1 - i, newest first', () => {
    const result = metricsToMinutePoints(metrics(10 * 60000, [5, 2, 0, 7]));
    expect(result).toEqual([
      { minute: 9, value: 5 },
      { minute: 8, value: 2 },
      { minute: 7, value: 0 },
      { minute: 6, value: 7 },
    ]);
  });

  it('coerces string values to numbers', () => {
    const m = metrics(10 * 60000, ['5', '0'] as unknown as number[]);
    expect(metricsToMinutePoints(m)).toEqual([
      { minute: 9, value: 5 },
      { minute: 8, value: 0 },
    ]);
  });

  it('drops points with non-positive minute index', () => {
    const result = metricsToMinutePoints(metrics(1 * 60000, [3, 9]));
    expect(result).toEqual([{ minute: 0, value: 3 }]);
  });
});
