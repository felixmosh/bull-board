import { BullBoardRequest, ControllerHandlerReturnType, QueueJob } from '../../typings/app';
import { errorResponse } from '../errors';
import { jobProvider } from '../providers/job';
import { queueProvider } from '../providers/queue';

async function removeUnprocessedChildren(
  _req: BullBoardRequest,
  job: QueueJob
): Promise<ControllerHandlerReturnType> {
  if (typeof job.removeUnprocessedChildren !== 'function') {
    return errorResponse(400, 'ERRORS.JOB_UNPROCESSED_CHILDREN_NOT_SUPPORTED');
  }

  const counts = await job.getDependenciesCount?.({ unprocessed: true });

  if (!counts?.unprocessed) {
    return errorResponse(400, 'ERRORS.JOB_HAS_NO_UNPROCESSED_CHILDREN');
  }

  await job.removeUnprocessedChildren();

  return { status: 200, body: { removed: counts.unprocessed } };
}

export const removeUnprocessedChildrenHandler = queueProvider(
  jobProvider(removeUnprocessedChildren)
);
