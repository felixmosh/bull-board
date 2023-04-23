import { STATUSES } from '@bull-board/api/dist/src/constants/statuses';

export const queueStatsStatusList = [
  STATUSES.active,
  STATUSES.waiting,
  STATUSES.completed,
  STATUSES.failed,
  STATUSES.delayed,
];
