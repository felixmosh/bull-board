import type { ErrorMessage } from '@bull-board/api/typings/app';
import i18n, { type ParseKeys } from 'i18next';

/**
 * Renders a message the API sent. Anything carrying a `key` is a translation the server left for
 * the client, so the dashboard language decides the wording rather than the server locale. A plain
 * string is text that only existed at runtime, such as the message of a thrown error, and is shown
 * as it arrived.
 *
 * `t()` is typed against en-US, which is what keeps the API's `ErrorTranslationKey` union honest:
 * a key the locale file does not define fails the type check here.
 */
export function translateMessage(message: ErrorMessage): string;
export function translateMessage(message: ErrorMessage | undefined): string | undefined;
export function translateMessage(message?: ErrorMessage): string | undefined {
  if (message === undefined || typeof message === 'string') {
    return message;
  }

  // Widening to `ParseKeys` is the check itself: a key the API can send that en-US does not
  // define fails to compile here, and the error names the offending key.
  const key: ParseKeys = message.key;

  return i18n.t(key, message.options);
}
