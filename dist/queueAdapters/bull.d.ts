/// <reference types="ioredis" />
import { AdapterOptions, JobCleanStatus, JobCounts, JobStatus, QueueAdapter } from '../@types/app';
import { Job, Queue } from 'bull';
export declare class BullAdapter implements QueueAdapter {
    queue: Queue;
    options: AdapterOptions;
    get client(): Promise<import("ioredis").Redis>;
    constructor(queue: Queue, options: AdapterOptions);
    getName(): string;
    clean(jobStatus: JobCleanStatus, graceTimeMs: number): Promise<any>;
    getJob(id: string): Promise<Job | undefined | null>;
    getJobs(jobStatuses: JobStatus[], start?: number, end?: number): Promise<Job[]>;
    getJobCounts(..._jobStatuses: JobStatus[]): Promise<JobCounts>;
}
