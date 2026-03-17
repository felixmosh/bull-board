import { create } from 'zustand';

type ConnectionFilterState = {
  disabledConnections: Set<string>;
  toggleConnection: (connection: string, allConnections: string[], soloDisable?: boolean) => void;
  setDisabledConnections: (disabled: Set<string>) => void;
};

export const useConnectionFilterStore = create<ConnectionFilterState>((set) => ({
  disabledConnections: new Set(),
  toggleConnection: (connection, allConnections, soloDisable) =>
    set((state) => {
      const next = new Set(state.disabledConnections);

      if (soloDisable) {
        // Cmd+Click: solo-disable the clicked toggle
        if (next.size === 1 && next.has(connection)) {
          next.clear();
        } else {
          next.clear();
          next.add(connection);
        }
      } else if (next.size === 0) {
        // None disabled (all visible): focus on clicked connection by disabling all others
        for (const c of allConnections) {
          if (c !== connection) next.add(c);
        }
      } else if (next.has(connection)) {
        next.delete(connection);
      } else {
        next.add(connection);
      }

      // If all would be disabled, reset to show all
      if (next.size >= allConnections.length) {
        next.clear();
      }

      return { disabledConnections: next };
    }),
  setDisabledConnections: (disabled) => set({ disabledConnections: disabled }),
}));
