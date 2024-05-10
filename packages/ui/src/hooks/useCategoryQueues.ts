import { AppQueue } from '@bull-board/api/typings/app';
import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useSearchQueue } from '../providers/SearchQueueProvider';

interface AccordionState {
  [key: string]: {
    isOpen: boolean;
  };
}

export const useCategoryQueues = () => {
  const location = useLocation();
  const { searchTerm, filteredQueues } = useSearchQueue();
  const isSearching = searchTerm.length > 0;

  const [queuesByCategoryState, setQueuesByCategoryState] = useState<AccordionState | null>(null);

  const pathname = location.pathname;
  const queueName = pathname.split('/');
  const currentQueue = filteredQueues.find((queue) => queueName.includes(queue.name));
  const currentCategory = currentQueue?.category;

  const queuesByCategory =
    filteredQueues?.reduce((acc, queue) => {
      const category = queue.category;
      acc[category] = [...(acc[category] || []), queue];
      return acc;
    }, {} as Record<string, AppQueue[]>) || {};

  const toggleCategoryState = (category: string) => {
    setQueuesByCategoryState((prevState) => ({
      ...prevState,
      [category]: { isOpen: !prevState?.[category]?.isOpen },
    }));
  };

  // Open category when direct link to queue is opened
  const verifyDirectLink = () => {
    if (!currentCategory) return;

    setQueuesByCategoryState((prevState) => ({
      ...prevState,
      [currentCategory]: { isOpen: true },
    }));
  };

  const collapseAllCategories = () => {
    setQueuesByCategoryState({
      ...Object.keys(queuesByCategory).reduce((acc, category) => {
        acc[category] = { isOpen: false };
        return acc;
      }, {} as AccordionState),
    });
  };

  const expandAllCategories = () => {
    setQueuesByCategoryState({
      ...Object.keys(queuesByCategory).reduce((acc, category) => {
        acc[category] = { isOpen: true };
        return acc;
      }, {} as AccordionState),
    });
  };

  const isAnyCategoryOpen = Object.values(queuesByCategoryState || {}).some(
    (state) => state.isOpen
  );

  const isSingleCategory = Object.keys(queuesByCategory || {}).length === 1;

  useEffect(() => {
    if (isSearching) {
      expandAllCategories();
    } else {
      collapseAllCategories();
    }
  }, [isSearching]);

  useEffect(() => {
    verifyDirectLink();
  }, [filteredQueues]);

  useEffect(() => {
    if (isSingleCategory) {
      expandAllCategories();
    }
  }, [isSingleCategory]);

  return {
    queuesByCategory,
    queuesByCategoryState,
    toggleCategoryState,
    currentQueue,
    currentCategory,
    collapseAllCategories,
    expandAllCategories,
    isAnyCategoryOpen,
  };
};
