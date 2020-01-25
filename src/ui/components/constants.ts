export const STATUSES = {
  active: 'active',
  completed: 'completed',
  delayed: 'delayed',
  failed: 'failed',
  latest: 'latest',
  paused: 'paused',
  waiting: 'waiting',
}

export type Status = keyof typeof STATUSES

export type Field =
  | 'attempts'
  | 'data'
  | 'id'
  | 'name'
  | 'opts'
  | 'progress'
  | 'timestamps'
  | 'delay'
  | 'failedReason'
  | 'retry'
  // REVIEW: this one is in none of the statuses, but we have a handler for it?
  | 'finish'

export const FIELDS: Record<Status, Field[]> = {
  active: ['attempts', 'data', 'id', 'name', 'opts', 'progress', 'timestamps'],
  completed: [
    'attempts',
    'data',
    'id',
    'name',
    'opts',
    'progress',
    'timestamps',
  ],
  delayed: ['attempts', 'data', 'delay', 'id', 'name', 'opts', 'timestamps'],
  failed: [
    'attempts',
    'failedReason',
    'id',
    'name',
    'progress',
    'retry',
    'timestamps',
  ],
  latest: ['attempts', 'data', 'id', 'name', 'opts', 'progress', 'timestamps'],
  paused: ['attempts', 'data', 'id', 'name', 'opts', 'timestamps'],
  waiting: ['data', 'id', 'name', 'opts', 'timestamps'],
}
