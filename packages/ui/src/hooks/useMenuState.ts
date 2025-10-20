import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type MenuState = {
  state: Record<string, boolean>;
  isMenuOpen: (menuPath: string, defaultOpen?: boolean) => boolean;
  toggleMenu: (menuPath: string) => void;
};

export const useMenuState = create<MenuState>()(
  persist(
    (set, get) => ({
      state: {},
      toggleMenu: (menuPath: string) =>
        set(({ state: prev }) => ({ state: { ...prev, [menuPath]: !prev[menuPath] } })),
      isMenuOpen: (menuPath: string, defaultOpen = true) => get().state[menuPath] ?? defaultOpen,
    }),
    {
      name: 'bull-board:menu-state',
    }
  )
);
