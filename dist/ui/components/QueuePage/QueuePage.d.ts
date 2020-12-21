/// <reference types="react" />
import { AppQueue } from '../../../@types/app';
import { Store } from '../../hooks/useStore';
export declare const QueuePage: ({ selectedStatus, actions, queue, }: {
    queue: AppQueue | undefined;
    actions: Store['actions'];
    selectedStatus: Store['selectedStatuses'];
}) => JSX.Element;
