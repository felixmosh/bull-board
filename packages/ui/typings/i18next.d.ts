import 'i18next';
import type messages from '../src/static/locales/en-US/messages.json';

// Makes `t()` type-checked against the primary locale (en-US). Unknown or
// misspelled keys become compile errors, and keys autocomplete. Other locales
// are kept in parity with en-US by the i18n completeness test, not by types.
declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'messages';
    resources: {
      messages: typeof messages;
    };
  }
}
