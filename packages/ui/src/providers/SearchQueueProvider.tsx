import { useState } from "react";
import React from "react";
import { useQueues } from "../hooks/useQueues";
import { AppQueue } from "@bull-board/api/typings/app";

interface SearchProviderProps {
  children: React.ReactNode;
}

interface SearchQueueContextProps {
  setSearchTerm: (searchTerm: string) => void;
  searchTerm: string;
  filteredQueues: AppQueue[];
}

const SearchQueueContext = React.createContext<SearchQueueContextProps>({
  setSearchTerm: () => { },
  searchTerm: '',
  filteredQueues: []
});

export const SearchQueueProvider = ({ children }: SearchProviderProps) => {
  const [searchTerm, setSearchTerm] = useState<string>('');
  const { queues } = useQueues();

  const filteredQueues = queues?.filter(({ name }) => name?.toLowerCase().includes(searchTerm.toLowerCase())) || [];

  return (
    <SearchQueueContext.Provider value={{ setSearchTerm, searchTerm, filteredQueues }}>
      {children}
    </SearchQueueContext.Provider>
  );
}

export const useSearchQueue = () => {
  const context = React.useContext(SearchQueueContext);
  if (context === undefined) {
    throw new Error('useSearchQueue must be used within a SearchQueueProvider');
  }
  return context;
}
