import { BaseAdapter } from '../queueAdapters/base';
import {
    BullBoardRequest,
    ControllerHandlerReturnType,
} from '../../typings/app';
import { queueProvider } from '../providers/queue';

async function empty(
    _req: BullBoardRequest,
    queue: BaseAdapter
): Promise<ControllerHandlerReturnType> {
    await queue.empty();

    return {
        status: 200,
        body: {},
    };
}

export const emptyHandler = queueProvider(empty);