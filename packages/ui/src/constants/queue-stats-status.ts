import { STATUSES } from '@wirdo-bullboard/api/src/constants/statuses';

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
