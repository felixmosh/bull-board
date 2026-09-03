export * from './serverAdapterContract';
export * from './redisFixtures';
// src/uiFixture/dist/ mirrors the real UI build layout so createBullBoard resolves
// view templates and static files the same way a production adapter would. The path is
// computed in a CommonJS sibling so this barrel stays loadable from an ESM jest project.
export { uiFixtureBasePath } from './uiFixturePath';
