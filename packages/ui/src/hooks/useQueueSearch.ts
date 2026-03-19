import { create } from 'zustand';

type QueueSearchState = {
  searchTerm: string;
  setSearchTerm: (term: string) => void;
};

export const useQueueSearch = create<QueueSearchState>((set) => ({
  searchTerm: '',
  setSearchTerm: (searchTerm: string) => set({ searchTerm }),
}));
