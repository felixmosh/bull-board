import path from 'path';
export * from './serverAdapterContract';
export * from './redisFixtures';
// src/uiFixture/dist/ mirrors the real UI build layout so createBullBoard resolves
// view templates and static files the same way a production adapter would.
/** Absolute path to the fixture UI base dir (contains dist/index.ejs + dist/static). */
export const uiFixtureBasePath = path.join(__dirname, 'uiFixture');
