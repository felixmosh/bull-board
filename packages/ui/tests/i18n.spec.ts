import fs from 'fs';
import os from 'os';
import path from 'path';
import { syncLocales } from 'i18next-locales-sync';
import { languages } from '../src/constants/languages';

// Reuse the same config `yarn sync:locales` runs on, so the test can never
// drift from the real sync behaviour.
const syncConfig = require('../localesSync.config.js') as {
  primaryLanguage: string;
  secondaryLanguages: string[];
  localesFolder: string;
  spaces: number;
};

const { primaryLanguage, secondaryLanguages, localesFolder, spaces } = syncConfig;
const localesDir = path.resolve(__dirname, '..', localesFolder);

const read = (p: string) => fs.readFileSync(p, 'utf8');

describe('i18n locales', () => {
  it('registers every locale folder in the languages list (and vice versa)', () => {
    expect([primaryLanguage, ...secondaryLanguages].sort()).toEqual([...languages].sort());
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
      syncLocales({
        primaryLanguage,
        secondaryLanguages,
        localesFolder: localesDir,
        outputFolder,
        spaces,
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
