import { errorResponse } from '../errors';
import { queueProvider } from '../providers/queue';
import { BaseAdapter } from '../queueAdapters/base';
import { GetQueuesHasWorkersQuery } from '../schemas/requests';
import { GetQueuesHasWorkersResponse, GetQueueWorkersResponse } from '../schemas/responses';
import { BullBoardRequest, ControllerHandlerReturnType } from '../types';

/**
 * The full worker list for one queue, for the section of the queue info panel that shows it.
 * The board's warning badge only needs `queuesHasWorkersHandler`, so this is asked for once,
 * when the panel opens, rather than on an interval.
 */
async function getQueueWorkers(
  req: BullBoardRequest,
  queue: BaseAdapter
): Promise<ControllerHandlerReturnType<GetQueueWorkersResponse>> {
  if (req.uiConfig?.showWorkers === false) {
    return errorResponse(403, 'ERRORS.WORKERS_DISABLED');
  }

  // `null` keeps "could not ask" distinct from "asked, nobody is there", so an unreachable
  // queue leaves the section out instead of claiming its workers are gone.
  const workers = await queue.getWorkers().catch(() => null);

  return { status: 200, body: { workers } };
}

export const queueWorkersHandler = queueProvider(getQueueWorkers, {
  skipReadOnlyModeCheck: true,
});

const HAS_WORKERS_CONCURRENCY = 4;
const HAS_WORKERS_TTL = 30_000;

const hasWorkersCache = new WeakMap<
  BaseAdapter,
  { expiresAt: number; result: Promise<boolean | null> }
>();

function hasWorkers(queue: BaseAdapter): Promise<boolean | null> {
  const cached = hasWorkersCache.get(queue);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.result;
  }

  const result = queue
    .getWorkers()
    .then((workers) => (workers ? workers.length > 0 : null))
    .catch(() => null);
  hasWorkersCache.set(queue, { expiresAt: Date.now() + HAS_WORKERS_TTL, result });
  return result;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = [];
  let next = 0;
  const run = async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return results;
}

export async function queuesHasWorkersHandler(
  req: BullBoardRequest<GetQueuesHasWorkersQuery>
): Promise<ControllerHandlerReturnType<GetQueuesHasWorkersResponse>> {
  if (req.uiConfig?.showWorkers === false) {
    return errorResponse(403, 'ERRORS.WORKERS_DISABLED');
  }

  const requested = req.query.queues;
  const queues = requested
    ? [...new Set(requested)].flatMap((name) => {
        const queue = req.queues.get(name);
        return queue ? [[name, queue] as const] : [];
      })
    : [...req.queues.entries()];

  const entries = await mapWithConcurrency(queues, HAS_WORKERS_CONCURRENCY, async ([name, queue]) =>
    (await queue.isVisible(req)) ? ([name, await hasWorkers(queue)] as const) : null
  );

  return {
    status: 200,
    body: { hasWorkers: Object.fromEntries(entries.filter((entry) => entry !== null)) },
  };
}
