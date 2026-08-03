/** What a queue is stored in. BullMQ v6 can be backed by PostgreSQL; everything else is Redis. */
export const DATASTORES = {
  redis: 'redis',
  postgres: 'postgres',
} as const;

export type DATASTORES = (typeof DATASTORES)[keyof typeof DATASTORES];
