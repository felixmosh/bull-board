import { FlowProducer, Job, JobNode, Queue } from 'bullmq';
import {
  JobCleanStatus,
  JobCounts,
  JobStatus,
  JobTreeNode,
  QueueAdapterOptions,
  QueueJobOptions,
  Status,
} from '../../typings/app';
import { STATUSES } from '../constants/statuses';
import { BaseAdapter } from './base';

export class BullMQAdapter extends BaseAdapter {
  constructor(private queue: Queue, options: Partial<QueueAdapterOptions> = {}) {
    const libName = 'bullmq';
    super(libName, options);
    if (
      !(queue instanceof Queue || `${(queue as Queue).metaValues?.version}`?.startsWith(libName))
    ) {
      throw new Error(`You've used the BullMQ adapter with a non-BullMQ queue.`);
    }
  }

  public async getRedisInfo(): Promise<string> {
    const client = await this.queue.client;
    return client.info();
  }

  public getName(): string {
    return `${this.prefix}${this.queue.name}`;
  }

  public async clean(jobStatus: JobCleanStatus, graceTimeMs: number): Promise<void> {
    await this.queue.clean(graceTimeMs, Number.MAX_SAFE_INTEGER, jobStatus);
  }

  public addJob(name: string, data: any, options: QueueJobOptions) {
    return this.queue.add(name, data, options);
  }

  public getJob(id: string): Promise<Job | undefined> {
    return this.queue.getJob(id);
  }

  public async getJobTree(id: string): Promise<JobTreeNode[]> {
    const client = await this.queue.client;
    const flow = new FlowProducer({ connection: client });
    const tree = await flow.getFlow({
      queueName: this.getName(),
      id,
    });

    if (!tree || !tree.children) {
      return [];
    }

    const mapTree = async (node: JobNode): Promise<JobTreeNode> => {
      const newTreeNode: JobTreeNode = {
        name: node.job.name,
        queueName: node.job.queueName,
        id: node.job.id ?? '',
        status: await this.queue.getJobState(node.job.id ?? ''),
      };

      if (node.children && node.children.length > 0) {
        newTreeNode.jobTree = await Promise.all(node.children.map(mapTree));
      }

      return newTreeNode;
    };

    return Promise.all(tree.children?.map(mapTree));
  }

  public getJobs(jobStatuses: JobStatus[], start?: number, end?: number): Promise<Job[]> {
    return this.queue.getJobs(jobStatuses, start, end);
  }

  public getJobCounts(): Promise<JobCounts> {
    return this.queue.getJobCounts() as unknown as Promise<JobCounts>;
  }

  public getJobLogs(id: string): Promise<string[]> {
    return this.queue.getJobLogs(id).then(({ logs }) => logs);
  }

  public isPaused(): Promise<boolean> {
    return this.queue.isPaused();
  }

  public pause(): Promise<void> {
    return this.queue.pause();
  }

  public resume(): Promise<void> {
    return this.queue.resume();
  }

  public empty(): Promise<void> {
    return this.queue.drain();
  }

  public async promoteAll(): Promise<void> {
    // since bullmq 4.6.0
    if (typeof this.queue.promoteJobs === 'function') {
      await this.queue.promoteJobs();
    } else {
      const jobs = await this.getJobs([STATUSES.delayed]);
      await Promise.all(jobs.map((job) => job.promote()));
    }
  }

  public getStatuses(): Status[] {
    return [
      STATUSES.latest,
      STATUSES.active,
      STATUSES.waiting,
      STATUSES.waitingChildren,
      STATUSES.prioritized,
      STATUSES.completed,
      STATUSES.failed,
      STATUSES.delayed,
      STATUSES.paused,
    ];
  }

  public getJobStatuses(): JobStatus[] {
    return [
      STATUSES.active,
      STATUSES.waiting,
      STATUSES.waitingChildren,
      STATUSES.prioritized,
      STATUSES.completed,
      STATUSES.failed,
      STATUSES.delayed,
      STATUSES.paused,
    ];
  }
}
