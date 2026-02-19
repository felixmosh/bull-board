import {
  BullBoardRequest,
  ControllerHandlerReturnType,
  JobRetryStatus,
  QueueJob,
} from '../../typings/app';
import { jobProvider } from '../providers/job';
import { queueProvider } from '../providers/queue';

function isRetriableState(state: string): state is JobRetryStatus {
  return state === 'failed' || state === 'completed';
}

async function retryJob(
  _req: BullBoardRequest,
  job: QueueJob
): Promise<ControllerHandlerReturnType> {
  const jobState = await job.getState();

  if (!isRetriableState(jobState)) {
    return {
      status: 400,
      body: { error: `Job is in "${jobState}" state and cannot be retried` },
    };
  }

  await job.retry(jobState);

  return {
    status: 204,
    body: {},
  };
}

export const retryJobHandler = queueProvider(jobProvider(retryJob));
