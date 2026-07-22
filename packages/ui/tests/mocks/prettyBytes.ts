const UNITS = ['B', 'kB', 'MB', 'GB'];

/**
 * CommonJS stand-in for the ESM-only `pretty-bytes`, close enough for assertions that
 * care about the number being rendered rather than its exact formatting.
 */
export default function prettyBytes(bytes: number): string {
  let value = bytes;
  let unit = 0;
  while (value >= 1000 && unit < UNITS.length - 1) {
    value /= 1000;
    unit += 1;
  }
  const rounded = unit === 0 ? String(value) : value.toFixed(1);
  return `${rounded} ${UNITS[unit]}`;
}
