import { BullBoardRequest, ControllerHandlerReturnType, QueueJob } from '../../typings/app';
import { jobProvider } from '../providers/job';
import { queueProvider } from '../providers/queue';
import { BaseAdapter } from '../queueAdapters/base';

/**
 * BullMQ's `ErrorCode.JobBelongsToJobScheduler`. It is raised only for the run a scheduler is
 * currently waiting on, because removing that run on its own would leave the scheduler registered
 * but unable to ever fire again. Past runs of the same scheduler are ordinary jobs and remove fine,
 * even though they also carry a `repeatJobKey`.
 */
const JOB_BELONGS_TO_JOB_SCHEDULER = -8;

function isJobSchedulerRun(error: unknown): boolean {
  return (error as { code?: number } | null | undefined)?.code === JOB_BELONGS_TO_JOB_SCHEDULER;
}

async function cleanJob(
  _req: BullBoardRequest,
  job: QueueJob,
  _queue: BaseAdapter
): Promise<ControllerHandlerReturnType> {
  try {
    await job.remove();
  } catch (error) {
    const jobSchedulerId = job.repeatJobKey;

    // Without a scheduler id there is nothing actionable to report back, so let the original
    // error surface instead of a 400 the caller cannot do anything with.
    if (!isJobSchedulerRun(error) || !jobSchedulerId) {
      throw error;
    }

    return {
      status: 400,
      body: {
        error: 'Job belongs to a job scheduler',
        message:
          `Job ${job.toJSON().id ?? 'unknown id'} is the next run of job scheduler ` +
          `${jobSchedulerId} and cannot be removed on its own. ` +
          `Remove the job scheduler to stop the schedule.`,
        code: 'JOB_BELONGS_TO_JOB_SCHEDULER',
        jobSchedulerId,
      },
    };
  }

  return {
    status: 204,
    body: {},
  };
}

export const cleanJobHandler = queueProvider(jobProvider(cleanJob));
