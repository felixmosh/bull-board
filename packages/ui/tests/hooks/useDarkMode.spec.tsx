import { act, renderHook } from '@testing-library/react';
import { useDarkMode } from '../../src/hooks/useDarkMode';
import { useSettingsStore } from '../../src/hooks/useSettings';

function mockMatchMedia(matches: boolean) {
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  const media = {
    matches,
    media: '(prefers-color-scheme: dark)',
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: (_event: string, listener: (event: MediaQueryListEvent) => void) => {
      listeners.add(listener);
    },
    removeEventListener: (_event: string, listener: (event: MediaQueryListEvent) => void) => {
      listeners.delete(listener);
    },
    dispatchEvent: () => false,
    dispatch(next: boolean) {
      media.matches = next;
      listeners.forEach((listener) => listener({ matches: next } as MediaQueryListEvent));
    },
  };

  window.matchMedia = () => media as unknown as MediaQueryList;
  return media;
}

describe('useDarkMode', () => {
  beforeEach(() => {
    document.body.classList.remove('dark-mode');
    mockMatchMedia(false);
    act(() => {
      useSettingsStore.setState({ theme: 'system' });
    });
  });

  it('adds the dark-mode class when the preference is dark', () => {
    act(() => {
      useSettingsStore.setState({ theme: 'dark' });
    });

    renderHook(() => useDarkMode());

    expect(document.body.classList.contains('dark-mode')).toBe(true);
  });

  it('removes the dark-mode class when the preference is light', () => {
    document.body.classList.add('dark-mode');
    act(() => {
      useSettingsStore.setState({ theme: 'light' });
    });

    renderHook(() => useDarkMode());

    expect(document.body.classList.contains('dark-mode')).toBe(false);
  });

  it('follows the system preference and updates when it changes', () => {
    const media = mockMatchMedia(true);
    act(() => {
      useSettingsStore.setState({ theme: 'system' });
    });

    renderHook(() => useDarkMode());

    expect(document.body.classList.contains('dark-mode')).toBe(true);

    act(() => media.dispatch(false));

    expect(document.body.classList.contains('dark-mode')).toBe(false);
  });

  it('stops following the system once a fixed theme is chosen', () => {
    const media = mockMatchMedia(false);
    act(() => {
      useSettingsStore.setState({ theme: 'system' });
    });

    renderHook(() => useDarkMode());

    expect(document.body.classList.contains('dark-mode')).toBe(false);

    act(() => {
      useSettingsStore.setState({ theme: 'light' });
    });

    act(() => media.dispatch(true));

    expect(document.body.classList.contains('dark-mode')).toBe(false);
  });
});
