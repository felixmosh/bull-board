import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { TabsType } from './useDetailsTabs';

interface SettingsState {
  pollingInterval: number;
  jobsPerPage: number;
  confirmQueueActions: boolean;
  confirmJobActions: boolean;
  collapseJob: boolean;
  collapseJobData: boolean;
  collapseJobOptions: boolean;
  collapseJobError: boolean;
  defaultJobTab: TabsType;
  setSettings: (settings: Partial<Omit<SettingsState, 'setSettings'>>) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      pollingInterval: 5,
      jobsPerPage: 10,
      confirmJobActions: true,
      confirmQueueActions: true,
      collapseJob: false,
      collapseJobData: false,
      collapseJobOptions: false,
      collapseJobError: false,
      defaultJobTab: 'Data',
      setSettings: (settings) => set(() => settings),
    }),
    {
      name: 'board-settings',
    }
  )
);
