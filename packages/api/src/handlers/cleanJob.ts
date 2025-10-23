import { BullBoardRequest, ControllerHandlerReturnType, QueueJob } from '../../typings/app';
import { jobProvider } from '../providers/job';
import { queueProvider } from '../providers/queue';
import { BaseAdapter } from '../queueAdapters/base';

function extractRepeatJobKey(job: QueueJob): string | undefined {
  const key = job.repeatJobKey;

  if (typeof key === 'string' && key.length > 0) {
    return key;
  }
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

    return {
      status: 204,
      body: {},
    };
  }

  await job.remove();
  return {
    status: 204,
    body: {},
  };
}

export const cleanJobHandler = queueProvider(jobProvider(cleanJob));
