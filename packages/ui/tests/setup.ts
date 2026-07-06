import { configure } from '@testing-library/react';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

configure({ asyncUtilTimeout: 5000 });

// `cimode` makes t(key) return the key verbatim, so specs read against real
// keys without loading locale files. See https://www.i18next.com/overview/api#changelanguage
i18n.use(initReactI18next).init({
  lng: 'cimode',
  fallbackLng: 'cimode',
  interpolation: { escapeValue: false },
  react: { useSuspense: false },
  showSupportNotice: false,
});

// jsdom has no matchMedia; the settings store reads prefers-color-scheme on load.
if (!window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList;
}
