import { create } from 'zustand';

type ConnectionFilterState = {
  disabledConnections: Set<string>;
  toggleConnection: (connection: string) => void;
};

export const useConnectionFilterStore = create<ConnectionFilterState>((set) => ({
  disabledConnections: new Set(),
  toggleConnection: (connection) =>
    set((state) => {
      const next = new Set(state.disabledConnections);
      if (next.has(connection)) {
        next.delete(connection);
      } else {
        next.add(connection);
      }
      return { disabledConnections: next };
    }),
}));
