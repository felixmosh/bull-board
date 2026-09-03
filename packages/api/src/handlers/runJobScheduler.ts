import { BullBoardRequest, ControllerHandlerReturnType } from '../../typings/app';
import { errorResponse } from '../errors';
import { queueProvider } from '../providers/queue';
import { BaseAdapter } from '../queueAdapters/base';
import { formatJob } from './queues';

/**
 * Fires a scheduler once, right now, without touching its schedule: the job that comes out is a
 * plain one-off built from the template, and the run the scheduler was already holding is left
 * where it was.
 */
async function runJobScheduler(
  req: BullBoardRequest,
  queue: BaseAdapter
): Promise<ControllerHandlerReturnType> {
  const { schedulerId } = req.params;

  if (!queue.supportsJobSchedulerRun) {
    return errorResponse(405, 'ERRORS.JOB_SCHEDULER_RUN_NOT_SUPPORTED');
  }

  const job = await queue.runJobSchedulerNow(schedulerId);

  if (job === 'not-found') {
    return errorResponse(404, 'ERRORS.JOB_SCHEDULER_NOT_FOUND');
  }

  return {
    status: 200,
    body: { job: formatJob(job, queue) },
  };
}

export const runJobSchedulerHandler = queueProvider(runJobScheduler);
