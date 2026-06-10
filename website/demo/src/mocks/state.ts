// Reuse the real @bull-board/api types. If the API surface changes, the demo
// fails to compile instead of silently drifting from production shapes.
import type { AppJob, AppQueue, JobCounts, Status } from '@bull-board/api/typings/app';

export type { AppJob, JobCounts, Status };

export type JobState = Exclude<Status, 'latest'>;

export interface DemoJob extends AppJob {
  state: JobState;
  queueName: string;
  logs: string[];
  parentKey?: string;
  childRefs?: Array<{ queueName: string; jobId: string }>;
}

// Demo-side shape of a queue: the same fields the UI reads off `AppQueue`,
// minus the server-computed `counts`/`pagination` (derived at read time) and
// with `jobs` typed as `DemoJob` so state.ts handlers can mutate them.
export type DemoQueue = Omit<AppQueue, 'counts' | 'pagination' | 'jobs'> & {
  jobs: DemoJob[];
};

export interface DemoState {
  queues: DemoQueue[];
}

export const state: DemoState = { queues: [] };

export function findQueue(name: string): DemoQueue | undefined {
  return state.queues.find((q) => q.name === name);
}

export function findJob(queueName: string, jobId: string): DemoJob | undefined {
  return findQueue(queueName)?.jobs.find((j) => String(j.id) === String(jobId));
}

export function countByStatus(queue: DemoQueue): JobCounts {
  const counts: JobCounts = {
    latest: 0,
    active: 0,
    waiting: 0,
    'waiting-children': 0,
    prioritized: 0,
    completed: 0,
    failed: 0,
    delayed: 0,
    paused: 0,
  };
  for (const j of queue.jobs) {
    counts[j.state] = (counts[j.state] ?? 0) + 1;
  }
  return counts;
}

let idCounter = 1;
export const nextJobId = () => String(idCounter++);
