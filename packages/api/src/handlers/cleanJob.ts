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
  const jobId = job.toJSON().id ?? 'unknown id';

  try {
    await job.remove();
  } catch (error) {
    const jobSchedulerId = job.repeatJobKey;

    // The scheduler id is what makes this answer actionable, so without one the error is left to
    // fall through rather than reported as a 400 the caller cannot do anything about.
    if (isJobSchedulerRun(error) && jobSchedulerId) {
      return {
        status: 400,
        body: {
          error: 'Job belongs to a job scheduler',
          message:
            `Job ${jobId} is the next run of job scheduler ${jobSchedulerId} and cannot be ` +
            `removed on its own. Remove the job scheduler to stop the schedule.`,
          code: 'JOB_BELONGS_TO_JOB_SCHEDULER',
          jobSchedulerId,
        },
      };
    }

    // A job held by a worker cannot be removed. BullMQ reports that without an error code, so the
    // job state is what separates this transient conflict from an actual server fault.
    if ((await job.getState().catch(() => null)) === 'active') {
      return {
        status: 409,
        body: {
          error: 'Job is currently active',
          message: `Job ${jobId} is being processed by a worker and cannot be removed until it finishes.`,
        },
      };
    }

    throw error;
  }

  return {
    status: 204,
    body: {},
  };
}

export const cleanJobHandler = queueProvider(jobProvider(cleanJob));
