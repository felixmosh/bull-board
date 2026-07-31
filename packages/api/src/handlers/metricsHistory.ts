import {
  AppControllerRoute,
  BullBoardRequest,
  ControllerHandlerReturnType,
  MetricsHistoryGranularity,
  MetricsHistoryMetric,
  MetricsHistoryPoint,
  MetricsHistoryProvider,
} from '../../typings/app';
import { errorResponse } from '../errors';

const GRANULARITIES: MetricsHistoryGranularity[] = ['hour', 'day'];
const METRICS: MetricsHistoryMetric[] = ['completed', 'failed', 'queueage'];
/** Answered when no metric is named, which is what the board's throughput chart asks for. */
const DEFAULT_METRICS: MetricsHistoryMetric[] = ['completed', 'failed'];

export function createMetricsHistoryHandler(
  provider: MetricsHistoryProvider
): AppControllerRoute['handler'] {
  return async function metricsHistoryHandler(
    req?: BullBoardRequest
  ): Promise<ControllerHandlerReturnType> {
    const query = req?.query ?? {};
    const granularity = (query.granularity as MetricsHistoryGranularity) ?? 'day';
    const queue =
      typeof query.queue === 'string' && query.queue.length > 0 ? query.queue : undefined;

    if (!GRANULARITIES.includes(granularity)) {
      return errorResponse(400, {
        key: 'ERRORS.INVALID_GRANULARITY',
        options: { granularity: String(granularity) },
      });
    }
    const isPresent = (value: unknown): value is string | number =>
      (typeof value === 'string' && value.length > 0) || typeof value === 'number';
    if (!isPresent(query.from) || !isPresent(query.to)) {
      return errorResponse(400, 'ERRORS.INVALID_DATE_RANGE');
    }
    const from = Number(query.from);
    const to = Number(query.to);
    if (!Number.isFinite(from) || !Number.isFinite(to) || to < from) {
      return errorResponse(400, 'ERRORS.INVALID_DATE_RANGE');
    }

    let metrics = DEFAULT_METRICS;
    if (isPresent(query.metric)) {
      const requested = String(query.metric) as MetricsHistoryMetric;
      if (!METRICS.includes(requested)) {
        return errorResponse(400, 'ERRORS.INVALID_METRIC');
      }
      metrics = [requested];
    }

    const series = await Promise.all(
      metrics.map((metric) => provider.getHistory({ queue, metric, from, to, granularity }))
    );
    const body: Partial<Record<MetricsHistoryMetric, MetricsHistoryPoint[]>> = {};
    metrics.forEach((metric, i) => {
      body[metric] = series[i];
    });
    return { status: 200, body };
  };
}
