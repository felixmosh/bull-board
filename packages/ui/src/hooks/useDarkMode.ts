import { useEffect } from 'react';
import { useSettingsStore } from './useSettings';

export function useDarkMode() {
  const { darkMode } = useSettingsStore();

  useEffect(() => {
    if (darkMode) {
      document.body.classList.add('dark-mode');
    } else {
      document.body.classList.remove('dark-mode');
    }
  }, [darkMode]);
}
