import { existsSync } from 'node:fs';
import path from 'node:path';
import { createBullBoard } from '@bull-board/api';
import type { IServerAdapter } from '../../typings/app';

// Guards the UI-path resolution the Next.js/Vercel integration depends on (#444).
// createBullBoard doesn't return the path, so capture what it passes the adapter.
function createCapturingAdapter() {
  const captured: { viewsPath?: string; staticRoute?: string; staticPath?: string } = {};

  const adapter: IServerAdapter = {
    setQueues: () => adapter,
    setViewsPath: (viewPath) => {
      captured.viewsPath = viewPath;
      return adapter;
    },
    setStaticPath: (staticsRoute, staticsPath) => {
      captured.staticRoute = staticsRoute;
      captured.staticPath = staticsPath;
      return adapter;
    },
    setEntryRoute: () => adapter,
    setErrorHandler: () => adapter,
    setApiRoutes: () => adapter,
    setUIConfig: () => adapter,
  };

  return { adapter, captured };
}

describe('UI base path resolution', () => {
  it('resolves the bundled @bull-board/ui assets by default', () => {
    const { adapter, captured } = createCapturingAdapter();

    createBullBoard({ queues: [], serverAdapter: adapter });

    expect(captured.viewsPath).toMatch(/dist$/);
    expect(captured.staticPath).toMatch(/dist[\\/]static$/);

    // #444: the paths must point at real files so a bundler can trace them.
    expect(existsSync(path.join(captured.viewsPath as string, 'index.ejs'))).toBe(true);
    expect(existsSync(captured.staticPath as string)).toBe(true);
  });

  it('honors an explicit options.uiBasePath override', () => {
    const { adapter, captured } = createCapturingAdapter();
    const uiBasePath = path.join('custom', 'ui', 'base');

    createBullBoard({ queues: [], serverAdapter: adapter, options: { uiBasePath } });

    expect(captured.viewsPath).toBe(path.join(uiBasePath, 'dist'));
    expect(captured.staticPath).toBe(path.join(uiBasePath, 'dist/static'));
  });
});
