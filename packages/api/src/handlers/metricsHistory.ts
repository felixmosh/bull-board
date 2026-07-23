import {
  AppControllerRoute,
  BullBoardRequest,
  ControllerHandlerReturnType,
  MetricsHistoryGranularity,
  MetricsHistoryProvider,
} from '../../typings/app';

const GRANULARITIES: MetricsHistoryGranularity[] = ['hour', 'day'];

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
      return { status: 400, body: { error: `Invalid granularity: ${String(granularity)}` } };
    }
    const isPresent = (value: unknown): value is string | number =>
      (typeof value === 'string' && value.length > 0) || typeof value === 'number';
    if (!isPresent(query.from) || !isPresent(query.to)) {
      return { status: 400, body: { error: 'Invalid from/to range' } };
    }
    const from = Number(query.from);
    const to = Number(query.to);
    if (!Number.isFinite(from) || !Number.isFinite(to) || to < from) {
      return { status: 400, body: { error: 'Invalid from/to range' } };
    }

    const [completed, failed] = await Promise.all([
      provider.getHistory({ queue, metric: 'completed', from, to, granularity }),
      provider.getHistory({ queue, metric: 'failed', from, to, granularity }),
    ]);
    return { status: 200, body: { completed, failed } };
  };
}
