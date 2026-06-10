import type {
  JobRetryStatus,
  QueueJob,
  QueueJobJson,
  Status,
} from '@bull-board/api/typings/app';
import type { DemoJob } from './state';
import { state } from './state';

export class MockQueueJob implements QueueJob {
  repeatJobKey: string | undefined;

  constructor(private demo: DemoJob) {}

  get opts() {
    return this.demo.opts ?? {};
  }

  async promote(): Promise<void> {
    if (this.demo.state === 'delayed') {
      this.demo.state = 'waiting';
      delete this.demo.delay;
    }
  }

  async remove(): Promise<void> {
    for (const q of state.queues) {
      const idx = q.jobs.findIndex((j) => String(j.id) === String(this.demo.id));
      if (idx !== -1) {
        q.jobs.splice(idx, 1);
        return;
      }
    }
  }

  async retry(_state?: JobRetryStatus): Promise<void> {
    this.demo.state = 'waiting';
    this.demo.attempts += 1;
    this.demo.failedReason = '';
    this.demo.stacktrace = [];
    this.demo.isFailed = false;
    this.demo.finishedOn = null;
  }

  toJSON(): QueueJobJson {
    return {
      id: this.demo.id,
      name: this.demo.name,
      progress: this.demo.progress,
      attemptsMade: this.demo.attempts,
      finishedOn: this.demo.finishedOn ?? null,
      processedOn: this.demo.processedOn ?? null,
      processedBy: this.demo.processedBy ?? null,
      delay: this.demo.delay,
      timestamp: this.demo.timestamp,
      failedReason: this.demo.failedReason,
      stacktrace: this.demo.stacktrace,
      data: this.demo.data,
      returnvalue: this.demo.returnValue,
      opts: this.demo.opts,
      parentKey: this.demo.parentKey,
    };
  }

  async getState(): Promise<Status | 'stuck' | 'waiting-children' | 'prioritized' | 'unknown'> {
    return this.demo.state as Status;
  }

  async update(jobData: Record<string, any>): Promise<void> {
    this.demo.data = jobData;
  }

  async updateData(jobData: Record<string, any>): Promise<void> {
    this.demo.data = jobData;
  }
}
