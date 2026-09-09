import type { GetMetricsHistoryQuery } from '../schemas/requests';
import { GetMetricsHistoryResponse } from '../schemas/responses';
import {
  AppControllerRoute,
  BullBoardRequest,
  ControllerHandlerReturnType,
  MetricsHistoryMetric,
  MetricsHistoryPoint,
  MetricsHistoryProvider,
} from '../types';

/** Answered when no metric is named, which is what the board's throughput chart asks for. */
const DEFAULT_METRICS: MetricsHistoryMetric[] = ['completed', 'failed'];

export function createMetricsHistoryHandler(
  provider: MetricsHistoryProvider
): AppControllerRoute<'GetMetricsHistoryResponse', GetMetricsHistoryQuery>['handler'] {
  return async function metricsHistoryHandler(
    req?: BullBoardRequest<GetMetricsHistoryQuery>
  ): Promise<ControllerHandlerReturnType<GetMetricsHistoryResponse>> {
    const { from, to, granularity, queue, metric } = req!.query;
    const metrics = metric ? [metric] : DEFAULT_METRICS;

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
