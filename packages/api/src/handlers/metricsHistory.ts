import {
  AppControllerRoute,
  BullBoardRequest,
  ControllerHandlerReturnType,
  MetricsHistoryGranularity,
  MetricsHistoryProvider,
  MetricsType,
} from '../../typings/app';

const METRICS: MetricsType[] = ['completed', 'failed'];
const GRANULARITIES: MetricsHistoryGranularity[] = ['hour', 'day'];

export function createMetricsHistoryHandler(
  provider: MetricsHistoryProvider
): AppControllerRoute['handler'] {
  return async function metricsHistoryHandler(
    req?: BullBoardRequest
  ): Promise<ControllerHandlerReturnType> {
    const query = req?.query ?? {};
    const metric = query.metric as MetricsType;
    const granularity = (query.granularity as MetricsHistoryGranularity) ?? 'day';
    const queue =
      typeof query.queue === 'string' && query.queue.length > 0 ? query.queue : undefined;

    if (!METRICS.includes(metric)) {
      return { status: 400, body: { error: `Invalid metric: ${String(metric)}` } };
    }
    if (!GRANULARITIES.includes(granularity)) {
      return { status: 400, body: { error: `Invalid granularity: ${String(granularity)}` } };
    }
    // `Number('')` is `0`, so a missing/empty `from`/`to` would otherwise silently pass
    // as a valid finite number. Reject anything that isn't a non-empty string or number.
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

    const points = await provider.getHistory({ queue, metric, from, to, granularity });
    return { status: 200, body: { points } };
  };
}
