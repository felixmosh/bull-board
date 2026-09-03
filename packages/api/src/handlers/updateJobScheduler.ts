import {
  BullBoardRequest,
  ControllerHandlerReturnType,
  JobSchedulerRepeatOptions,
} from '../../typings/app';
import { EmptyResponse } from '../../typings/responses';
import { errorResponse } from '../errors';
import { queueProvider } from '../providers/queue';
import { BaseAdapter } from '../queueAdapters/base';

function isPositiveNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

/**
 * Rewrites the schedule of an existing scheduler. Only the schedule: the job the scheduler
 * produces keeps the name, data and options the application registered, so an edit here cannot
 * silently change what runs.
 */
async function updateJobScheduler(
  req: BullBoardRequest,
  queue: BaseAdapter
): Promise<ControllerHandlerReturnType<EmptyResponse>> {
  const { schedulerId } = req.params;

  if (!queue.supportsJobSchedulerUpdate) {
    return errorResponse(405, 'ERRORS.JOB_SCHEDULER_EDIT_NOT_SUPPORTED');
  }

  const { pattern, every, tz, limit, endDate } = req.body as Record<string, unknown>;

  const hasPattern = typeof pattern === 'string' && pattern.trim().length > 0;
  const hasEvery = every !== undefined && every !== null;

  if (hasPattern === hasEvery) {
    return errorResponse(400, 'ERRORS.INVALID_SCHEDULER_SCHEDULE');
  }

  if (hasEvery && !isPositiveNumber(every)) {
    return errorResponse(400, 'ERRORS.INVALID_SCHEDULER_INTERVAL');
  }

  if (
    limit !== undefined &&
    limit !== null &&
    (!isPositiveNumber(limit) || !Number.isInteger(limit))
  ) {
    return errorResponse(400, 'ERRORS.INVALID_SCHEDULER_LIMIT');
  }

  if (endDate !== undefined && endDate !== null) {
    if (!isPositiveNumber(endDate) || endDate <= Date.now()) {
      return errorResponse(400, 'ERRORS.INVALID_SCHEDULER_END_DATE');
    }
  }

  const repeat: JobSchedulerRepeatOptions = {
    ...(hasPattern ? { pattern: (pattern as string).trim() } : { every: every as number }),
    ...(typeof tz === 'string' && tz.trim().length > 0 ? { tz: tz.trim() } : {}),
    ...(limit !== undefined && limit !== null ? { limit: limit as number } : {}),
    ...(endDate !== undefined && endDate !== null ? { endDate: endDate as number } : {}),
  };

  const result = await queue.updateJobScheduler(schedulerId, repeat);

  if (result === 'not-found') {
    return errorResponse(404, 'ERRORS.JOB_SCHEDULER_NOT_FOUND');
  }

  if (result === 'invalid-schedule') {
    return errorResponse(400, 'ERRORS.INVALID_SCHEDULER_PATTERN');
  }

  return {
    status: 204,
    body: {},
  };
}

export const updateJobSchedulerHandler = queueProvider(updateJobScheduler);
