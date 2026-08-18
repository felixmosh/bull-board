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

  it('loads a CommonJS .js config', async () => {
    const cwd = tempDir();
    writeFileSync(join(cwd, 'bull-board.config.js'), 'module.exports = { port: 4324 };');

    await expect(loadConfigFile({ cwd })).resolves.toEqual({ port: 4324 });
  });

  it('routes an .mjs config through a dynamic import and unwraps the default export', async () => {
    const cwd = tempDir();
    writeFileSync(join(cwd, 'bull-board.config.mjs'), 'export default { port: 4323 };');
    const seen: string[] = [];
    const importModule = async (specifier: string) => {
      seen.push(specifier);

      return { default: { port: 4323 } };
    };

    await expect(loadConfigFile({ cwd, importModule })).resolves.toEqual({ port: 4323 });
    expect(seen[0]).toMatch(/^file:\/\/.*bull-board\.config\.mjs$/);
  });

  it('falls back to a dynamic import when a .js config turns out to be ESM', async () => {
    const cwd = tempDir();
    writeFileSync(join(cwd, 'bull-board.config.js'), 'export default { port: 4325 };');
    const importModule = async () => ({ default: { port: 4325 } });

    await expect(loadConfigFile({ cwd, importModule })).resolves.toEqual({ port: 4325 });
  });

  it('surfaces a config file that throws instead of retrying it as ESM', async () => {
    const cwd = tempDir();
    writeFileSync(join(cwd, 'bull-board.config.cjs'), 'throw new Error("boom in config");');
    const importModule = jest.fn();

    await expect(loadConfigFile({ cwd, importModule })).rejects.toThrow('boom in config');
    expect(importModule).not.toHaveBeenCalled();
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

  it('rejects a JSON config that exports an array', async () => {
    const cwd = tempDir();
    writeFileSync(join(cwd, 'bull-board.config.json'), JSON.stringify(['bull']));

    await expect(loadConfigFile({ cwd })).rejects.toThrow(/must export an object/);
  });

  it('rejects a JSON config that is a bare null', async () => {
    const cwd = tempDir();
    writeFileSync(join(cwd, 'bull-board.config.json'), 'null');

    await expect(loadConfigFile({ cwd })).rejects.toThrow(/must export an object/);
  });

  it('reports the file path when a JSON config fails to parse', async () => {
    const cwd = tempDir();
    const path = join(cwd, 'bull-board.config.json');
    writeFileSync(path, '{ not valid json');

    await expect(loadConfigFile({ cwd })).rejects.toThrow(
      new RegExp(`Could not parse ${path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`)
    );
  });
});
