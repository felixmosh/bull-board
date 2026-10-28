import { errorResponse } from '../errors';
import { queueProvider } from '../providers/queue';
import { BaseAdapter } from '../queueAdapters/base';
import type { CreateJobSchedulerBody } from '../schemas/requests';
import { EmptyResponse } from '../schemas/responses';
import { BullBoardRequest, ControllerHandlerReturnType, JobSchedulerRepeatOptions } from '../types';

async function createJobScheduler(
  req: BullBoardRequest<Record<string, unknown>, CreateJobSchedulerBody>,
  queue: BaseAdapter
): Promise<ControllerHandlerReturnType<EmptyResponse>> {
  const { id, name, data, repeat: schedule } = req.body;
  const { pattern, every, tz, limit, endDate } = schedule;
  const hasPattern = typeof pattern === 'string' && pattern.trim().length > 0;

  const repeat: JobSchedulerRepeatOptions = {
    ...(hasPattern ? { pattern: pattern!.trim() } : { every: every as number }),
    ...(typeof tz === 'string' && tz.trim().length > 0 ? { tz: tz.trim() } : {}),
    ...(limit !== undefined && limit !== null ? { limit } : {}),
    ...(endDate !== undefined && endDate !== null ? { endDate } : {}),
  };

  const result = await queue.createJobScheduler(id, name, data, repeat);

  if (result === 'invalid-schedule') {
    return errorResponse(400, 'ERRORS.INVALID_SCHEDULER_PATTERN');
  }

  return {
    status: 204,
    body: {},
  };
}

export const createJobSchedulerHandler = queueProvider(createJobScheduler);
