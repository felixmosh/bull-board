/// <reference types="react" />
import { Status } from '../../constants';
interface JobActionsProps {
    status: Status;
    actions: {
        promoteJob: () => Promise<void>;
        retryJob: () => Promise<void>;
        cleanJob: () => Promise<void>;
    };
}
export declare const JobActions: ({ actions, status }: JobActionsProps) => JSX.Element | null;
export {};
