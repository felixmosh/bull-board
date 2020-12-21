/// <reference types="react" />
import { AppQueue } from '../../../@types/app';
import { Store } from '../../hooks/useStore';
import { Status } from '../constants';
interface QueueActionProps {
    queue: AppQueue;
    actions: Store['actions'];
    status: Status;
}
export declare const QueueActions: ({ status, actions, queue }: QueueActionProps) => JSX.Element | null;
export {};
