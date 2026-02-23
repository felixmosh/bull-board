import { create } from 'zustand';

type QueueFilterState = {
  searchTerm: string;
  setSearchTerm: (term: string) => void;
};

export const useQueueFilterStore = create<QueueFilterState>((set) => ({
  searchTerm: '',
  setSearchTerm: (searchTerm) => set({ searchTerm }),
}));
