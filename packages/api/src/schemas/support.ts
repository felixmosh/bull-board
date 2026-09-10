import * as v from 'valibot';
import type { ErrorTranslationKey } from './errorKeys';

const OPTIONS_SEPARATOR = '\u0000';

export function key(
  translationKey: ErrorTranslationKey,
  options?: Record<string, unknown>
): string {
  return options
    ? `${translationKey}${OPTIONS_SEPARATOR}${JSON.stringify(options)}`
    : translationKey;
}

export function decodeKey(message: string): {
  key: string;
  options?: Record<string, unknown>;
} {
  const [translationKey, options] = message.split(OPTIONS_SEPARATOR);
  return options ? { key: translationKey, options: JSON.parse(options) } : { key: translationKey };
}

export function totalRecord<const K extends string, S extends v.GenericSchema>(
  keys: readonly K[],
  value: S
) {
  return v.object(Object.fromEntries(keys.map((entry) => [entry, value])) as { [P in K]: S });
}

export type SchemaMap = Record<string, v.GenericSchema>;
