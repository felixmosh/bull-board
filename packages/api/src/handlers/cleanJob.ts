import { BullBoardRequest, ControllerHandlerReturnType, QueueJob } from '../../typings/app';
import { jobProvider } from '../providers/job';
import { queueProvider } from '../providers/queue';
import { BaseAdapter } from '../queueAdapters/base';

function extractRepeatJobKey(job: QueueJob): string | undefined {
  // Check direct property first (BullMQ stores it here)
  if (typeof job.repeatJobKey === 'string' && job.repeatJobKey.length > 0) {
    return job.repeatJobKey;
  }

  // Fallback to JSON representation
  const jobJson = job.toJSON() as {
    repeatJobKey?: string;
    opts?: { repeatJobKey?: string };
  };

  const repeatFromJson = jobJson.repeatJobKey;
  const repeatFromOpts = jobJson.opts?.repeatJobKey;

  return typeof repeatFromJson === 'string' && repeatFromJson.length > 0
    ? repeatFromJson
    : typeof repeatFromOpts === 'string' && repeatFromOpts.length > 0
      ? repeatFromOpts
      : undefined;
}

async function cleanJob(
  _req: BullBoardRequest,
  job: QueueJob,
  queue: BaseAdapter
): Promise<ControllerHandlerReturnType> {
  const repeatJobKey = extractRepeatJobKey(job);

  if (repeatJobKey) {
    const removed = await queue.removeJobScheduler(repeatJobKey);

    if (!removed) {
      throw new Error(
        `Failed to remove scheduler ${repeatJobKey} for job ${job.toJSON().id ?? 'unknown id'}.`
      );
    }
  } else {
    await job.remove();
  }

  return {
    status: 204,
    body: {},
  };
}

export const cleanJobHandler = queueProvider(jobProvider(cleanJob));
