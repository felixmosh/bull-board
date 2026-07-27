import fs from 'fs';
import path from 'path';
import { errorResponse } from '@bull-board/api/dist/errors';

describe('errorResponse', () => {
  it('expands a bare key into a translatable message', () => {
    expect(errorResponse(404, 'ERRORS.QUEUE_NOT_FOUND')).toEqual({
      status: 404,
      body: { error: { key: 'ERRORS.QUEUE_NOT_FOUND' } },
    });
  });

  it('keeps interpolation options on the key it belongs to', () => {
    expect(
      errorResponse(400, { key: 'ERRORS.INVALID_GRANULARITY', options: { granularity: 'x' } })
    ).toEqual({
      status: 400,
      body: { error: { key: 'ERRORS.INVALID_GRANULARITY', options: { granularity: 'x' } } },
    });
  });

  it('carries a detail message, a code and any extra fields alongside the headline', () => {
    expect(
      errorResponse(400, 'ERRORS.JOB_BELONGS_TO_JOB_SCHEDULER', {
        message: { key: 'ERRORS.JOB_BELONGS_TO_JOB_SCHEDULER_DETAILS', options: { jobId: '1' } },
        code: 'JOB_BELONGS_TO_JOB_SCHEDULER',
        jobSchedulerId: 'nightly',
      })
    ).toEqual({
      status: 400,
      body: {
        error: { key: 'ERRORS.JOB_BELONGS_TO_JOB_SCHEDULER' },
        message: {
          key: 'ERRORS.JOB_BELONGS_TO_JOB_SCHEDULER_DETAILS',
          options: { jobId: '1' },
        },
        code: 'JOB_BELONGS_TO_JOB_SCHEDULER',
        jobSchedulerId: 'nightly',
      },
    });
  });

  // `ControllerHandlerReturnType['body']` is `Record<string, any>`, so nothing at the type level
  // stops a handler from answering with `body: { error: 'Some English sentence' }` and bypassing
  // translation altogether. This is the guard for that hole.
  it('is the only way error text leaves the package', () => {
    const srcDir = path.resolve(__dirname, '../../src');

    const sourceFiles = (function collect(dir: string): string[] {
      return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const entryPath = path.join(dir, entry.name);
        if (entry.isDirectory()) return collect(entryPath);
        return entry.name.endsWith('.ts') ? [entryPath] : [];
      });
    })(srcDir);

    const hardcoded = sourceFiles.filter((file) =>
      /\berror:\s*['"`]/.test(fs.readFileSync(file, 'utf8'))
    );

    expect(hardcoded.map((file) => path.relative(srcDir, file))).toEqual([]);
  });
});
