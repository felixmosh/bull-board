import { BullBoardRequest, ControllerHandlerReturnType, QueueJob } from '../../typings/app';
import { errorResponse } from '../errors';
import { jobProvider } from '../providers/job';
import { queueProvider } from '../providers/queue';

const PRIORITY_LIMIT = 2 ** 21 - 1;

async function changeDelay(
  req: BullBoardRequest,
  job: QueueJob
): Promise<ControllerHandlerReturnType> {
  if (typeof job.changeDelay !== 'function') {
    return errorResponse(400, 'ERRORS.JOB_EDIT_NOT_SUPPORTED');
  }

  const { runAt } = req.body ?? {};

  if (typeof runAt !== 'number' || !Number.isFinite(runAt)) {
    return errorResponse(400, 'ERRORS.INVALID_RUN_AT');
  }

  const state = await job.getState();
  if (state !== 'delayed') {
    return errorResponse(400, { key: 'ERRORS.JOB_NOT_DELAYED', options: { status: state } });
  }

  await job.changeDelay(Math.max(0, runAt - Date.now()));

  return { status: 200, body: {} };
}

async function changePriority(
  req: BullBoardRequest,
  job: QueueJob
): Promise<ControllerHandlerReturnType> {
  if (typeof job.changePriority !== 'function') {
    return errorResponse(400, 'ERRORS.JOB_EDIT_NOT_SUPPORTED');
  }

  const { priority } = req.body ?? {};

  if (
    typeof priority !== 'number' ||
    !Number.isInteger(priority) ||
    priority < 0 ||
    priority > PRIORITY_LIMIT
  ) {
    return errorResponse(400, { key: 'ERRORS.INVALID_PRIORITY', options: { max: PRIORITY_LIMIT } });
  }

  await job.changePriority({ priority });

  return { status: 200, body: {} };
}

export const changeJobDelayHandler = queueProvider(jobProvider(changeDelay));
export const changeJobPriorityHandler = queueProvider(jobProvider(changePriority));
