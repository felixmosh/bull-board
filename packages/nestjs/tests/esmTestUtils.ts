import { fileURLToPath } from 'node:url';

export * from '@bull-board/test-utils/src/serverAdapterContract';
export * from '@bull-board/test-utils/src/redisFixtures';

export const uiFixtureBasePath = fileURLToPath(
  new URL('../../test-utils/src/uiFixture', import.meta.url)
);
