import type { UITheme } from '@bull-board/api/typings/app';

/** Runtime mirror of the ThemeTokenName type in @bull-board/api. */
export const TOKEN_NAMES = new Set([
  'background',
  'foreground',
  'card',
  'card-foreground',
  'popover',
  'popover-foreground',
  'primary',
  'primary-foreground',
  'secondary',
  'secondary-foreground',
  'muted',
  'muted-foreground',
  'accent',
  'accent-foreground',
  'state-hover',
  'state-selected',
  'state-selected-hover',
  'state-selected-foreground',
  'destructive',
  'destructive-foreground',
  'border',
  'input',
  'ring',
  'radius',
  'shadow-popover',
  'shadow-ring',
  'shadow-control',
  'overlay',
  'font-sans',
  'font-mono',
  'sidebar',
  'sidebar-foreground',
  'sidebar-primary',
  'sidebar-primary-foreground',
  'sidebar-accent',
  'sidebar-accent-foreground',
  'sidebar-state-hover',
  'sidebar-state-selected',
  'sidebar-state-selected-hover',
  'sidebar-state-selected-foreground',
  'sidebar-border',
  'sidebar-ring',
  'chart-1',
  'chart-2',
  'chart-3',
  'chart-4',
  'chart-5',
  'status-failed',
  'status-completed',
  'status-waiting',
  'status-waiting-children',
  'status-prioritized',
  'status-active',
  'status-delayed',
  'status-paused',
]);

/** Plain CSS values only: no blocks, no rule injection, no HTML. */
const SAFE_VALUE = /^[^;{}<>]+$/;

function toDeclarations(tokens: Record<string, string> | undefined): string {
  if (!tokens) {
    return '';
  }

  return Object.entries(tokens)
    .filter(([name, value]) => TOKEN_NAMES.has(name) && SAFE_VALUE.test(String(value)))
    .map(([name, value]) => `--${name}: ${value};`)
    .join(' ');
}

export function buildThemeOverridesCss(theme: UITheme | undefined): string {
  const light = toDeclarations(theme?.light);
  // body.dark-mode outranks the stylesheet's .dark-mode block and, being set on
  // body, also shadows any :root-level light override through inheritance.
  const dark = toDeclarations(theme?.dark);

  return [light && `:root { ${light} }`, dark && `body.dark-mode { ${dark} }`]
    .filter(Boolean)
    .join('\n');
}

export function applyThemeOverrides(theme: UITheme | undefined): void {
  const css = buildThemeOverridesCss(theme);
  if (!css) {
    return;
  }

  const style = document.createElement('style');
  style.id = 'bb-theme-overrides';
  style.textContent = css;
  document.head.appendChild(style);
}
