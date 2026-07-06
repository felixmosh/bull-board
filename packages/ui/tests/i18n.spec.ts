import fs from 'fs';
import os from 'os';
import path from 'path';
import { syncLocales } from 'i18next-locales-sync';
import { languages } from '../src/constants/languages';

const localesDir = path.resolve(__dirname, '../src/static/locales');
const primaryLanguage = 'en-US';

const read = (p: string) => fs.readFileSync(p, 'utf8');

const localeFolders = fs
  .readdirSync(localesDir)
  .filter((name) => fs.statSync(path.join(localesDir, name)).isDirectory());

describe('i18n locales', () => {
  it('registers every locale folder in the languages list (and vice versa)', () => {
    expect([...localeFolders].sort()).toEqual([...languages].sort());
  });

  it('ships a messages.json for every registered language', () => {
    for (const lng of languages) {
      expect(fs.existsSync(path.join(localesDir, lng, 'messages.json'))).toBe(true);
    }
  });

  // Guards against adding/removing a key in en-US without running `yarn sync:locales`.
  // Re-runs the sync into a throwaway folder and asserts it produces no changes,
  // which is exactly what a synced tree looks like (plurals expanded per CLDR).
  it('keeps every locale in sync with en-US (run `yarn sync:locales`)', () => {
    const outputFolder = fs.mkdtempSync(path.join(os.tmpdir(), 'bb-locales-'));
    try {
      const secondaryLanguages = localeFolders.filter((lng) => lng !== primaryLanguage).sort();

      syncLocales({
        primaryLanguage,
        secondaryLanguages,
        localesFolder: localesDir,
        outputFolder,
        spaces: 2,
      });

      const outOfSync = secondaryLanguages.filter(
        (lng) =>
          read(path.join(localesDir, lng, 'messages.json')) !==
          read(path.join(outputFolder, lng, 'messages.json'))
      );

      expect(outOfSync).toEqual([]);
    } finally {
      fs.rmSync(outputFolder, { recursive: true, force: true });
    }
  });
});
