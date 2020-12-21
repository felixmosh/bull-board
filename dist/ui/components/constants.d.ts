import { KeyOf } from '../../@types/utils';
export declare const STATUSES: {
    latest: string;
    active: string;
    waiting: string;
    completed: string;
    failed: string;
    delayed: string;
    paused: string;
};
export declare const STATUS_LIST: KeyOf<typeof STATUSES>;
export declare type Status = keyof typeof STATUSES;
export declare type Field = 'attempts' | 'data' | 'id' | 'name' | 'opts' | 'progress' | 'timestamps' | 'delay' | 'failedReason' | 'retry' | 'promote' | 'clean';
export declare const FIELDS: Record<Status, Field[]>;
