import { create } from 'zustand';

type ConnectionFilterState = {
  disabledConnections: Set<string>;
  toggleConnection: (connection: string, allConnections: string[]) => void;
};

export const useConnectionFilterStore = create<ConnectionFilterState>((set) => ({
  disabledConnections: new Set(),
  toggleConnection: (connection, allConnections) =>
    set((state) => {
      const next = new Set(state.disabledConnections);

      if (next.size === 0) {
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
}));
