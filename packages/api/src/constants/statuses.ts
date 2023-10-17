export const STATUSES = {
  latest: 'latest',
  active: 'active',
  waiting: 'waiting',
  completed: 'completed',
  failed: 'failed',
  delayed: 'delayed',
  paused: 'paused',
} as const;

export const STATUSES_EXT = {
  latest: 'latest',
  active: 'active',
  waiting: 'waiting',
  'waiting-children': 'waiting-children',
  'prioritized': 'prioritized',
  completed: 'completed',
  failed: 'failed',
  delayed: 'delayed',
  paused: 'paused',
} as const;
