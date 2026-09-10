import { queueProvider } from '../providers/queue';
import { BaseAdapter } from '../queueAdapters/base';
import type { AddJobBody } from '../schemas/requests';
import { AddJobResponse } from '../schemas/responses';
import { BullBoardRequest, ControllerHandlerReturnType } from '../types';
import { formatJob } from './queues';

async function addJob(
  req: BullBoardRequest<Record<string, any>, AddJobBody>,
  queue: BaseAdapter
): Promise<ControllerHandlerReturnType<AddJobResponse>> {
  const { name, data, options } = req.body;

  const job = await queue.addJob(name, data, options);

  return {
    status: 200,
    body: {
      job: formatJob(job, queue),
      status: await job.getState(),
    },
  };
}

export const addJobHandler = queueProvider(addJob);
