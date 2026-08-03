/**
 * Compile-only gate for the `bullmq: ^5.79.2 || ^6.0.0` peer range. Peer majors break types
 * before they break runtime, which is exactly how v6 landed here: `Queue#client` vanished from
 * the typings while every runtime call still looked fine.
 *
 * Run once per major by `yarn typecheck:bullmq`, against the built `dist/` typings, which is
 * what an installing project compiles against. Nothing here executes, so `yarn build` has to
 * have run first.
 *
 * `src/` is deliberately not in this program. Type-checking it alongside `dist/` produces two
 * declarations of `BaseAdapter` and TS rejects every assignment between them, which is why
 * `yarn build` deletes `dist/` before compiling. That is a pre-existing property of this
 * package, not something the version matrix introduced. Both majors are covered at the source
 * level by the runtime matrix in `tests/bullmq-matrix/` instead.
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
