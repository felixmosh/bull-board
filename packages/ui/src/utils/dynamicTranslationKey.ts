import type { ParseKeys } from 'i18next';

/**
 * Asserts a runtime-constructed translation key as a valid i18next key.
 *
 * `t()` is typed against the en-US resources, so it rejects string keys the
 * compiler cannot prove exist. A handful of call sites build the key from a
 * runtime value (a status, tab, or action name) and cannot be checked
 * statically. Route those through this helper so the escape hatch is explicit
 * and greppable instead of scattering `as ParseKeys` casts across components.
 */
export const dynamicTranslationKey = (key: string): ParseKeys => key as ParseKeys;
