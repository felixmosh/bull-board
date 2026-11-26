import type { GetSearchStatusResponse } from '@bull-board/api/typings/responses';

export const HEALTH_KEYS = {
  ok: 'QUEUE.SEARCH.INDEX.OK',
  degraded: 'QUEUE.SEARCH.INDEX.DEGRADED',
  down: 'QUEUE.SEARCH.INDEX.DOWN',
} as const satisfies Record<GetSearchStatusResponse['health'], string>;
