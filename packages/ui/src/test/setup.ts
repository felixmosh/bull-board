import { configure } from '@testing-library/react';

configure({ asyncUtilTimeout: 5000 });

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
