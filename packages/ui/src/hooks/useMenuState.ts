import { useCallback, useState } from 'react';

const STORAGE_KEY = 'bull-board-menu-state';

type MenuState = Record<string, boolean>;

export function useMenuState() {
  const [menuState, setMenuState] = useState<MenuState>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
    }
  });

  const toggleMenu = useCallback((menuPath: string) => {
    setMenuState((prev) => {
      const newState = {
        ...prev,
        [menuPath]: !prev[menuPath]
      };
      
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(newState));
      } catch {
        // Ignore localStorage errors
      }
      
      return newState;
    });
  }, []);

  const isMenuOpen = useCallback((menuPath: string, defaultOpen = true) => {
    return menuState[menuPath] !== undefined ? menuState[menuPath] : defaultOpen;
  }, [menuState]);

  return { toggleMenu, isMenuOpen };
}
