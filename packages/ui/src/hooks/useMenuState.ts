import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type MenuState = {
  state: Record<string, boolean>;
  isMenuOpen: (menuPath: string, defaultOpen?: boolean) => boolean;
  toggleMenu: (menuPath: string) => void;
  expandAll: (paths: string[]) => void;
  collapseAll: (paths: string[]) => void;
};

export const useMenuState = create<MenuState>()(
  persist(
    (set, get) => ({
      state: {},
      toggleMenu: (menuPath: string) =>
        set(({ state: prev }) => ({
          state: { ...prev, [menuPath]: !(prev[menuPath] ?? true) },
        })),
      isMenuOpen: (menuPath: string, defaultOpen = true) => get().state[menuPath] ?? defaultOpen,
      expandAll: (paths: string[]) =>
        set(({ state: prev }) => ({
          state: { ...prev, ...Object.fromEntries(paths.map((p) => [p, true])) },
        })),
      collapseAll: (paths: string[]) =>
        set(({ state: prev }) => ({
          state: { ...prev, ...Object.fromEntries(paths.map((p) => [p, false])) },
        })),
    }),
    {
      name: 'bull-board:menu-state',
    }
  )
);
