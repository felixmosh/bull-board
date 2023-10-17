import { STATUSES } from '@bull-board/api/src/constants/statuses';

export const queueStatsStatusList = [
  STATUSES.active,
  STATUSES.waiting,
  STATUSES.waitingChildren,
  STATUSES.prioritized,
  STATUSES.completed,
  STATUSES.failed,
  STATUSES.delayed,
  STATUSES.paused,
];
