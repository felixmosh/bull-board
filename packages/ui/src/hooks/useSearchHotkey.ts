import { useEffect } from 'react';
import { useSettingsStore } from './useSettings';

export function useSearchHotkey() {
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        if (useSettingsStore.getState().sidebarCollapsed) {
          useSettingsStore.getState().setSettings({ sidebarCollapsed: false });
        }
        requestAnimationFrame(() => {
          document.getElementById('search-queues')?.focus();
        });
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);
}
