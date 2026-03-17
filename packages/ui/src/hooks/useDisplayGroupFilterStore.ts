import { create } from 'zustand';

type DisplayGroupFilterState = {
  disabledDisplayGroups: Set<string>;
  toggleDisplayGroup: (displayGroup: string, allDisplayGroups: string[], soloDisable?: boolean) => void;
  setDisabledDisplayGroups: (disabled: Set<string>) => void;
};

export const useDisplayGroupFilterStore = create<DisplayGroupFilterState>((set) => ({
  disabledDisplayGroups: new Set(),
  toggleDisplayGroup: (displayGroup, allDisplayGroups, soloDisable) =>
    set((state) => {
      const next = new Set(state.disabledDisplayGroups);

      if (soloDisable) {
        // Cmd+Click: solo-disable the clicked toggle
        if (next.size === 1 && next.has(displayGroup)) {
          next.clear();
        } else {
          next.clear();
          next.add(displayGroup);
        }
      } else if (next.size === 0) {
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
  setDisabledDisplayGroups: (disabled) => set({ disabledDisplayGroups: disabled }),
}));
