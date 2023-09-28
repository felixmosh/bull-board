import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface SearchPromptState {
  searchPrompt    : string|undefined
  setSearchPrompt : (searchPrompt:string) => void
}
export const useSearchPromptStore = create<SearchPromptState>()(
  persist(
    (set) => ({
      searchPrompt: undefined,
      setSearchPrompt: (searchPrompt) => set(() => ({searchPrompt})),
    }),{
      name : 'board-queue-search-prompt'
    }
  )
);
