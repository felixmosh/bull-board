export function toCamelCase(val: string): string {
  return val
    .split('-')
    .map((part, idx) => (idx > 0 ? `${part[0].toUpperCase()}${part.slice(1)}` : part))
    .join('');
}
