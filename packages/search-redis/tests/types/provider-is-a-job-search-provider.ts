import type { JobSearchProvider } from '@bull-board/api/typings/app';
import { createRedisSearchProvider } from '../../src';

declare const index: Parameters<typeof createRedisSearchProvider>[0];

export const provider: JobSearchProvider = createRedisSearchProvider(index);

// @ts-expect-error
export const incomplete: JobSearchProvider = { fields: async () => [] };
