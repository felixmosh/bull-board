import { create } from 'zustand';

type DisplayGroupFilterState = {
  disabledDisplayGroups: Set<string>;
  toggleDisplayGroup: (displayGroup: string, allDisplayGroups: string[]) => void;
};

export const useDisplayGroupFilterStore = create<DisplayGroupFilterState>((set) => ({
  disabledDisplayGroups: new Set(),
  toggleDisplayGroup: (displayGroup, allDisplayGroups) =>
    set((state) => {
      const next = new Set(state.disabledDisplayGroups);

      if (next.size === 0) {
        // None disabled (all visible): focus on clicked group by disabling all others
        for (const g of allDisplayGroups) {
          if (g !== displayGroup) next.add(g);
        }
      } else if (next.has(displayGroup)) {
        next.delete(displayGroup);
      } else {
        next.add(displayGroup);
      }

      // If all would be disabled, reset to show all
      if (next.size >= allDisplayGroups.length) {
        next.clear();
      }

      return { disabledDisplayGroups: next };
    }),
}));
