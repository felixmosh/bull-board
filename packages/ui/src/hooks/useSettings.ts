import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { TabsType } from './useDetailsTabs';
import { QueueSortKey, SortDirection } from './useSortQueues';

interface SettingsState {
  language: string;
  pollingInterval: number;
  jobsPerPage: number;
  confirmQueueActions: boolean;
  confirmJobActions: boolean;
  collapseJob: boolean;
  collapseJobData: boolean;
  collapseJobOptions: boolean;
  collapseJobError: boolean;
  darkMode: boolean;
  defaultJobTab: TabsType;
  sorting: { dashboard: { key: QueueSortKey; direction: SortDirection } };
  setSettings: (settings: Partial<Omit<SettingsState, 'setSettings'>>) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      language: '',
      pollingInterval: 5,
      jobsPerPage: 10,
      confirmJobActions: true,
      confirmQueueActions: true,
      collapseJob: false,
      collapseJobData: false,
      collapseJobOptions: false,
      collapseJobError: false,
      darkMode: window.matchMedia('(prefers-color-scheme: dark)').matches,
      defaultJobTab: 'Data',
      sorting: { dashboard: { key: 'alphabetical', direction: 'asc' } },
      setSettings: (settings) => set(() => settings),
    }),
    {
      name: 'board-settings',
    }
  )
);
