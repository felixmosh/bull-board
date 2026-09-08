import { BullBoardRequest, ControllerHandlerReturnType, QueueRateLimit } from '../../typings/app';
import { EmptyResponse, GetQueueRateLimitResponse } from '../../typings/responses';
import { errorResponse } from '../errors';
import { queueProvider } from '../providers/queue';
import { BaseAdapter } from '../queueAdapters/base';

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

async function getConfiguredRateLimit(
  _req: BullBoardRequest,
  queue: BaseAdapter
): Promise<ControllerHandlerReturnType<GetQueueRateLimitResponse>> {
  if (!queue.supportsGlobalRateLimit) {
    return { status: 200, body: { supported: false, rateLimit: null } };
  }

  return {
    status: 200,
    body: { supported: true, rateLimit: await queue.getConfiguredRateLimit() },
  };
}

async function setConfiguredRateLimit(
  req: BullBoardRequest,
  queue: BaseAdapter
): Promise<ControllerHandlerReturnType<EmptyResponse>> {
  if (!queue.supportsGlobalRateLimit) {
    return errorResponse(400, 'ERRORS.RATE_LIMIT_NOT_SUPPORTED');
  }

  const { max, duration } = (req.body ?? {}) as Partial<QueueRateLimit>;

  if (max === null || max === undefined) {
    await queue.removeConfiguredRateLimit();
    return { status: 200, body: {} };
  }

  if (!isPositiveInteger(max) || !isPositiveInteger(duration)) {
    return errorResponse(400, 'ERRORS.INVALID_RATE_LIMIT');
  }

  await queue.setConfiguredRateLimit({ max, duration });
  return { status: 200, body: {} };
}

async function releaseActiveRateLimit(
  _req: BullBoardRequest,
  queue: BaseAdapter
): Promise<ControllerHandlerReturnType<EmptyResponse>> {
  await queue.releaseActiveRateLimit();
  return { status: 200, body: {} };
}

export const getRateLimitHandler = queueProvider(getConfiguredRateLimit, {
  skipReadOnlyModeCheck: true,
});
export const setRateLimitHandler = queueProvider(setConfiguredRateLimit);
export const releaseRateLimitHandler = queueProvider(releaseActiveRateLimit);
