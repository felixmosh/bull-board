/// <reference types="react" />
import { AppJob } from '../../@types/app';
import { Status } from '../components/constants';
export declare function useDetailsTabs(currentStatus: Status): {
    tabs: {
        title: string;
        isActive: boolean;
        selectTab: () => void;
    }[];
    selectedTab: string;
    getTabContent: ({ data, returnValue, opts, failedReason, stacktrace, }: AppJob) => JSX.Element | null;
};
