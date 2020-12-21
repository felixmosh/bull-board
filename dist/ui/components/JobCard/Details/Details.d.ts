/// <reference types="react" />
import { AppJob } from '../../../../@types/app';
import { Status } from '../../constants';
interface DetailsProps {
    job: AppJob;
    status: Status;
}
export declare const Details: ({ status, job }: DetailsProps) => JSX.Element | null;
export {};
