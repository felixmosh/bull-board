import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfigFile } from '../src/config/file';

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), 'bull-board-cli-'));
}

describe('loadConfigFile', () => {
  it('returns an empty object when there is no config file', async () => {
    await expect(loadConfigFile({ cwd: tempDir() })).resolves.toEqual({});
  });

  it('loads a JSON config from the working directory', async () => {
    const cwd = tempDir();
    writeFileSync(join(cwd, 'bull-board.config.json'), JSON.stringify({ port: 4321 }));

    await expect(loadConfigFile({ cwd })).resolves.toEqual({ port: 4321 });
  });

  it('loads a CommonJS config exporting an object', async () => {
    const cwd = tempDir();
    writeFileSync(join(cwd, 'bull-board.config.cjs'), 'module.exports = { port: 4322 };');

    await expect(loadConfigFile({ cwd })).resolves.toEqual({ port: 4322 });
  });

  it('loads an ESM config with a default export', async () => {
    const cwd = tempDir();
    writeFileSync(join(cwd, 'bull-board.config.mjs'), 'export default { port: 4323 };');

    await expect(loadConfigFile({ cwd })).resolves.toEqual({ port: 4323 });
  });

  it('prefers an explicit path over discovery', async () => {
    const cwd = tempDir();
    writeFileSync(join(cwd, 'bull-board.config.json'), JSON.stringify({ port: 1 }));
    const explicit = join(cwd, 'other.json');
    writeFileSync(explicit, JSON.stringify({ port: 2 }));

    await expect(loadConfigFile({ cwd, explicitPath: explicit })).resolves.toEqual({ port: 2 });
  });

  it('throws when an explicit path is missing', async () => {
    await expect(
      loadConfigFile({ cwd: tempDir(), explicitPath: '/nope/absent.json' })
    ).rejects.toThrow(/absent.json/);
  });
});
