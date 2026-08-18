import fs from 'node:fs';
import path from 'node:path';
import { TOKEN_NAMES } from '../../src/utils/themeOverrides';

const themeCss = fs.readFileSync(path.join(__dirname, '../../src/theme.css'), 'utf8');

interface Rule {
  selector: string;
  declarations: Record<string, string>;
}

/** theme.css is hand-written and flat: selector, block, no nesting except @media. */
function parseRules(css: string): Rule[] {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const rules: Rule[] = [];

  for (const [, selector, body] of withoutComments.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const declarations: Record<string, string> = {};

    for (const [, name, value] of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
      declarations[name] = value.trim();
    }

    rules.push({ selector: selector.trim().replace(/\s+/g, ' '), declarations });
  }

  return rules;
}

const RUNTIME_TOKENS = new Set([
  '--anchor-width',
  '--collapsible-panel-height',
  '--overview-group-top',
  '--flag-color',
  '--level',
  '--fade-start',
  '--fade-end',
]);

function collectStylesheets(dir: string): Array<{ file: string; css: string }> {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      return collectStylesheets(full);
    }

    return entry.name.endsWith('.css')
      ? [
          {
            file: path.relative(path.join(__dirname, '../..'), full),
            css: fs.readFileSync(full, 'utf8'),
          },
        ]
      : [];
  });
}

const rules = parseRules(themeCss);
const rulesFor = (selector: string) => rules.filter((rule) => rule.selector === selector);
const declaredIn = (selector: string) =>
  new Set(rulesFor(selector).flatMap((rule) => Object.keys(rule.declarations)));

const light = declaredIn(':root');
const dark = declaredIn('.dark-mode');
const derived = declaredIn(':root, .dark-mode');

describe('theme.css', () => {
  it('ships a value for every token uiConfig.theme accepts', () => {
    const declared = new Set([...light, ...dark, ...derived]);
    const missing = [...TOKEN_NAMES].filter((name) => !declared.has(`--${name}`));

    expect(missing).toEqual([]);
  });

  it('gives the dark theme a value for every colour the light theme defines', () => {
    /** Layout, type, shape and elevation are one value for both themes by design. */
    const achromatic = [
      '--header-height',
      '--menu-width',
      '--body-padding',
      '--card-padding',
      '--font-sans',
      '--font-mono',
      '--radius',
      '--shadow-popover',
      '--shadow-control',
      '--overlay',
    ];

    const missing = [...light].filter((name) => !achromatic.includes(name) && !dark.has(name));

    expect(missing).toEqual([]);
  });

  /**
   * The one way this file breaks silently. A custom property that references another is
   * substituted where it is declared, and `.dark-mode` sits on `body`: a `var(--primary)`
   * declared only under `:root` freezes the light primary and never picks up the dark one.
   * Such a token has to be declared under a selector that matches both themes, or repeated
   * in each.
   */
  it('declares every token that references another token for both themes', () => {
    const singleThemeRules = rules.filter(
      (rule) => rule.selector === ':root' || rule.selector === '.dark-mode'
    );

    const frozen = singleThemeRules.flatMap((rule) =>
      Object.entries(rule.declarations)
        .filter(([, value]) => value.includes('var(--'))
        .map(([name]) => name)
        .filter((name) => !derived.has(name) && !(light.has(name) && dark.has(name)))
    );

    expect(frozen).toEqual([]);
  });

  it('reads no custom property that nothing declares', () => {
    const stylesheets = collectStylesheets(path.join(__dirname, '../../src'));
    const declared = new Set(
      stylesheets.flatMap(({ css }) => [...css.matchAll(/(--[\w-]+)\s*:/g)].map(([, name]) => name))
    );

    const dangling = stylesheets.flatMap(({ file, css }) =>
      [...css.matchAll(/var\(\s*(--[\w-]+)\s*\)/g)]
        .map(([, name]) => name)
        .filter((name) => !declared.has(name) && !RUNTIME_TOKENS.has(name))
        .map((name) => `${file}: ${name}`)
    );

    expect(dangling).toEqual([]);
  });

  it('derives the tokens that used to repeat the brand colour', () => {
    for (const name of ['--ring', '--sidebar-primary', '--sidebar-ring']) {
      expect(derived.has(name)).toBe(true);
      expect(light.has(name)).toBe(false);
      expect(dark.has(name)).toBe(false);
    }

    const [shared] = rulesFor(':root, .dark-mode');
    expect(shared.declarations['--ring']).toBe('var(--primary)');
    expect(shared.declarations['--sidebar-primary']).toBe('var(--primary)');
    expect(shared.declarations['--sidebar-ring']).toBe('var(--primary)');
  });
});
