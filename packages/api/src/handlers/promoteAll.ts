import { BullBoardRequest, ControllerHandlerReturnType } from "../../typings/app";
import { BaseAdapter } from "../queueAdapters/base";
import { STATUSES } from "../constants/statuses";
import { queueProvider } from "../providers/queue";

async function promoteAll(
    _req: BullBoardRequest,
    queue: BaseAdapter
): Promise<ControllerHandlerReturnType>  {
    const queueStatus = STATUSES.delayed;

    const jobs = await queue.getJobs([queueStatus]);
    await Promise.all(jobs.map((job) => job.promote()));

    return { status: 200, body: {} };
}

export const promoteAllHandler = queueProvider(promoteAll);
