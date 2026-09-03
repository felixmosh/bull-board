import {
  BullBoardRequest,
  ControllerHandlerReturnType,
  JobRetryStatus,
  QueueJob,
} from '../../typings/app';
import { EmptyResponse } from '../../typings/responses';
import { errorResponse } from '../errors';
import { jobProvider } from '../providers/job';
import { queueProvider } from '../providers/queue';

function isRetriableState(state: string): state is JobRetryStatus {
  return state === 'failed' || state === 'completed';
}

async function retryJob(
  _req: BullBoardRequest,
  job: QueueJob
): Promise<ControllerHandlerReturnType<EmptyResponse>> {
  const jobState = await job.getState();

  if (!isRetriableState(jobState)) {
    return errorResponse(400, { key: 'ERRORS.JOB_NOT_RETRIABLE', options: { state: jobState } });
  }

  await job.retry(jobState);

  return {
    status: 204,
    body: {},
  };
}

export const retryJobHandler = queueProvider(jobProvider(retryJob));
