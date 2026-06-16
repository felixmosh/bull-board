export * from './serverAdapterContract';
export * from './redisFixtures';
import path from 'path';
/** Absolute path to the fixture UI base dir (contains dist/index.ejs + dist/static). */
export const uiFixtureBasePath = path.join(__dirname, 'uiFixture');
