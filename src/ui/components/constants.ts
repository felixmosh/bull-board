export const STATUSES = {
  latest: 'latest',
  active: 'active',
  waiting: 'waiting',
  completed: 'completed',
  failed: 'failed',
  delayed: 'delayed',
  paused: 'paused',
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
  | 'promote'
  | 'clean'

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
  delayed: [
    'attempts',
    'data',
    'delay',
    'id',
    'name',
    'opts',
    'promote',
    'timestamps',
    'clean',
  ],
  failed: [
    'attempts',
    'failedReason',
    'data',
    'opts',
    'id',
    'name',
    'progress',
    'retry',
    'timestamps',
    'clean',
  ],
  latest: ['attempts', 'data', 'id', 'name', 'opts', 'progress', 'timestamps'],
  paused: ['attempts', 'data', 'id', 'name', 'opts', 'timestamps'],
  waiting: ['data', 'id', 'name', 'opts', 'timestamps', 'clean'],
}
