import { errorResponse } from '../errors';
import { jobProvider } from '../providers/job';
import { queueProvider } from '../providers/queue';
import type { ChangeJobDelayBody, ChangeJobPriorityBody } from '../schemas/requests';
import type { EmptyResponse } from '../schemas/responses';
import { BullBoardRequest, ControllerHandlerReturnType, QueueJob } from '../types';

async function changeDelay(
  req: BullBoardRequest<Record<string, any>, ChangeJobDelayBody>,
  job: QueueJob
): Promise<ControllerHandlerReturnType<EmptyResponse>> {
  if (typeof job.changeDelay !== 'function') {
    return errorResponse(400, 'ERRORS.JOB_EDIT_NOT_SUPPORTED');
  }

  const state = await job.getState();
  if (state !== 'delayed') {
    return errorResponse(400, { key: 'ERRORS.JOB_NOT_DELAYED', options: { status: state } });
  }

  await job.changeDelay(Math.max(0, req.body.runAt - Date.now()));

  return { status: 200, body: {} };
}

async function changePriority(
  req: BullBoardRequest<Record<string, any>, ChangeJobPriorityBody>,
  job: QueueJob
): Promise<ControllerHandlerReturnType<EmptyResponse>> {
  if (typeof job.changePriority !== 'function') {
    return errorResponse(400, 'ERRORS.JOB_EDIT_NOT_SUPPORTED');
  }

  await job.changePriority({ priority: req.body.priority });

  return { status: 200, body: {} };
}

export const changeJobDelayHandler = queueProvider(jobProvider(changeDelay));
export const changeJobPriorityHandler = queueProvider(jobProvider(changePriority));
