/// <reference types="react" />
import { AppQueue } from '../../../@types/app';
import { Store } from '../../hooks/useStore';
export declare const StatusMenu: ({ queue, selectedStatus, onChange, }: {
    queue: AppQueue;
    selectedStatus: Store['selectedStatuses'];
    onChange: (status: Store['selectedStatuses']) => void;
}) => JSX.Element;
