import { errorResponse } from '../errors';
import { queueProvider } from '../providers/queue';
import { BaseAdapter } from '../queueAdapters/base';
import type { UpdateJobSchedulerBody } from '../schemas/requests';
import { EmptyResponse } from '../schemas/responses';
import { BullBoardRequest, ControllerHandlerReturnType, JobSchedulerRepeatOptions } from '../types';

/**
 * Rewrites the schedule of an existing scheduler. Only the schedule: the job the scheduler
 * produces keeps the name, data and options the application registered, so an edit here cannot
 * silently change what runs.
 */
async function updateJobScheduler(
  req: BullBoardRequest<Record<string, any>, UpdateJobSchedulerBody>,
  queue: BaseAdapter
): Promise<ControllerHandlerReturnType<EmptyResponse>> {
  const { schedulerId } = req.params;

  if (!queue.supportsJobSchedulerUpdate) {
    return errorResponse(405, 'ERRORS.JOB_SCHEDULER_EDIT_NOT_SUPPORTED');
  }

  const { pattern, every, tz, limit, endDate } = req.body;
  const hasPattern = typeof pattern === 'string' && pattern.trim().length > 0;

  const repeat: JobSchedulerRepeatOptions = {
    ...(hasPattern ? { pattern: pattern!.trim() } : { every: every as number }),
    ...(typeof tz === 'string' && tz.trim().length > 0 ? { tz: tz.trim() } : {}),
    ...(limit !== undefined && limit !== null ? { limit } : {}),
    ...(endDate !== undefined && endDate !== null ? { endDate } : {}),
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
