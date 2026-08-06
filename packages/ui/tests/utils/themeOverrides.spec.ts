import { applyThemeOverrides, buildThemeOverridesCss } from '../../src/utils/themeOverrides';

describe('buildThemeOverridesCss', () => {
  it('returns an empty string when no theme is provided', () => {
    expect(buildThemeOverridesCss(undefined)).toBe('');
    expect(buildThemeOverridesCss({})).toBe('');
  });

  it('builds :root declarations for light overrides', () => {
    const css = buildThemeOverridesCss({ light: { primary: '#0f6f64', radius: '0.75rem' } });

    expect(css).toBe(':root { --primary: #0f6f64; --radius: 0.75rem; }');
  });

  it('builds body.dark-mode declarations for dark overrides', () => {
    const css = buildThemeOverridesCss({ dark: { background: '#0b0e12' } });

    expect(css).toBe('body.dark-mode { --background: #0b0e12; }');
  });

  it('combines light and dark blocks', () => {
    const css = buildThemeOverridesCss({
      light: { primary: 'rebeccapurple' },
      dark: { primary: 'plum' },
    });

    expect(css).toBe(':root { --primary: rebeccapurple; }\nbody.dark-mode { --primary: plum; }');
  });

  it('accepts every documented token namespace', () => {
    const css = buildThemeOverridesCss({
      light: {
        'status-failed': 'crimson',
        'chart-3': 'steelblue',
        'sidebar-primary': 'teal',
        'font-mono': "'Fira Code', monospace",
      },
    });

    expect(css).toContain('--status-failed: crimson;');
    expect(css).toContain('--chart-3: steelblue;');
    expect(css).toContain('--sidebar-primary: teal;');
    expect(css).toContain("--font-mono: 'Fira Code', monospace;");
  });

  it('accepts the interaction state tokens', () => {
    const css = buildThemeOverridesCss({
      light: {
        'state-hover': 'rgb(0 0 0 / 0.04)',
        'state-selected': 'rgb(0 0 0 / 0.1)',
        'state-selected-hover': 'rgb(0 0 0 / 0.16)',
        'state-selected-foreground': 'black',
        'sidebar-state-hover': 'rgb(255 255 255 / 0.06)',
        'sidebar-state-selected': 'rgb(255 255 255 / 0.12)',
        'sidebar-state-selected-hover': 'rgb(255 255 255 / 0.2)',
        'sidebar-state-selected-foreground': 'white',
      },
    });

    expect(css).toContain('--state-hover: rgb(0 0 0 / 0.04);');
    expect(css).toContain('--state-selected-foreground: black;');
    expect(css).toContain('--sidebar-state-selected: rgb(255 255 255 / 0.12);');
    expect(css).toContain('--sidebar-state-selected-foreground: white;');
  });

  it('drops unknown token names', () => {
    const css = buildThemeOverridesCss({
      light: { 'not-a-token': 'red', primary: 'teal' } as any,
    });

    expect(css).toBe(':root { --primary: teal; }');
  });

  it('drops values that could escape the declaration block', () => {
    const css = buildThemeOverridesCss({
      light: {
        primary: 'red; } body { display: none',
        background: '<script>alert(1)</script>',
        border: '#fff',
      } as any,
    });

    expect(css).toBe(':root { --border: #fff; }');
  });
});

describe('applyThemeOverrides', () => {
  afterEach(() => {
    document.getElementById('bb-theme-overrides')?.remove();
  });

  it('appends a style tag with the generated css', () => {
    applyThemeOverrides({ light: { primary: 'teal' } });

    const style = document.getElementById('bb-theme-overrides');
    expect(style?.textContent).toBe(':root { --primary: teal; }');
  });

  it('does not append a style tag when there is nothing to apply', () => {
    applyThemeOverrides(undefined);

    expect(document.getElementById('bb-theme-overrides')).toBeNull();
  });
});
