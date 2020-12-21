import { Job, Queue } from 'bullmq';
import * as Redis from 'ioredis';
import { JobCleanStatus, JobCounts, JobStatus, QueueAdapter } from '../@types/app';
export declare class BullMQAdapter implements QueueAdapter {
    private queue;
    private readonly LIMIT;
    get client(): Promise<Redis.Redis>;
    constructor(queue: Queue);
    getName(): string;
    clean(jobStatus: JobCleanStatus, graceTimeMs: number): Promise<void>;
    getJob(id: string): Promise<Job | undefined>;
    getJobs(jobStatuses: JobStatus[], start?: number, end?: number): Promise<Job[]>;
    getJobCounts(...jobStatuses: JobStatus[]): Promise<JobCounts>;
}
