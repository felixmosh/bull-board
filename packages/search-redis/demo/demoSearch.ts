import type { JobSearchProvider } from '@bull-board/api/typings/app';
import type { Queue } from 'bullmq';
import type { Cluster, Redis } from 'ioredis';
import { createRedisSearchProvider } from '../src/createRedisSearchProvider';
import { RedisSearch, RedisSearchIndexerOptions } from '../src/RedisSearch';

export const DEMO_TENANTS: string[] = ['acme', 'globex', 'initech', 'umbrella', 'hooli'];

const RENAME_PAGE = 100;

export function createDemoSearch(options: {
  connection: Redis | Cluster;
  indexer: RedisSearchIndexerOptions;
  orders: Queue;
  emails: Queue;
  payments: Queue;
}): {
  search: RedisSearch;
  providers: { orders: JobSearchProvider; emails: JobSearchProvider; payments: JobSearchProvider };
} {
  const search = new RedisSearch({
    connection: options.connection,
    indexer: options.indexer,
    fields: { name: 'name' },
  });

  return {
    search,
    providers: {
      orders: search.add(options.orders, {
        fields: { 'data.tenantId': 'data.tenantId', 'data.orderId': 'data.orderId' },
      }),
      emails: search.add(options.emails, { fields: { 'data.to': 'data.to' } }),
      payments: search.add(options.payments, { fields: { 'data.customerId': 'data.customerId' } }),
    },
  };
}

export async function renameTenant(
  search: RedisSearch,
  queue: Queue,
  from: string,
  to: string
): Promise<number> {
  const provider = createRedisSearchProvider(search.index(queue));
  const matches: string[] = [];
  let cursor: string | undefined;
  do {
    const page = await provider.search({
      field: 'data.tenantId',
      value: from,
      cursor,
      limit: RENAME_PAGE,
    });
    matches.push(...page.jobIds);
    cursor = page.cursor;
  } while (cursor);

  let renamed = 0;
  for (const jobId of matches) {
    const job = await queue.getJob(jobId);
    if (job?.data?.tenantId !== from) continue;
    await job.updateData({ ...job.data, tenantId: to });
    renamed += 1;
  }

  await search.reindex(queue, matches);
  return renamed;
}
