import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type CollapseState = {
  state: Record<string, boolean>;
  isMenuOpen: (menuPath: string, defaultOpen?: boolean) => boolean;
  toggleMenu: (menuPath: string) => void;
  expandAll: (paths: string[]) => void;
  collapseAll: (paths: string[]) => void;
};

export function createCollapseStore(persistKey: string) {
  return create<CollapseState>()(
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
        name: persistKey,
      }
    )
  );
}

export const useMenuState = createCollapseStore('bull-board:menu-state');
export const useOverviewState = createCollapseStore('bull-board:overview-state');
