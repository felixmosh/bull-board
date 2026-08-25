/**
 * Compile-only gate for the `bullmq: ^5.50.0 || ^6.0.0` peer range, run once per major by
 * `yarn typecheck:bullmq`. Nothing here executes, and it needs `yarn build` first because it
 * checks the built `dist/` typings, which is what an installing project compiles against.
 *
 * `src/` is deliberately not in this program: type-checking it alongside `dist/` gives two
 * declarations of `BaseAdapter` that TS refuses to assign between, which is why `yarn build`
 * deletes `dist/` first. The runtime matrix covers source against both majors instead.
 */
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { Queue } from 'bullmq';

const connection = { host: 'localhost', port: 6379 };

// Written the way a consumer writes it, with no annotation coaching the inference.
const adapter = new BullMQAdapter(new Queue('typecheck', { connection }), { readOnlyMode: true });

export const statuses: string[] = adapter.getStatuses();
export const key: string = adapter.getQueueKey('completed');
export const counts: Promise<Record<string, number>> = adapter.getJobCounts();

// Null is part of the contract now: a v6 queue on a non-Redis backend has no INFO to report
// and no client to hand out.
export const info: Promise<string | null> = adapter.getRedisInfo();
export const client: Promise<unknown | null> = adapter.getClient();
