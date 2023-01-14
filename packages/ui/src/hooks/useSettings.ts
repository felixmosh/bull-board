import create from 'zustand';
import { persist } from 'zustand/middleware';

interface SettingsState {
  pollingInterval: number;
  jobsPerPage: number;
  confirmQueueActions: boolean;
  confirmJobActions: boolean;
  darkMode: boolean;
  setSettings: (settings: Partial<Omit<SettingsState, 'setSettings'>>) => void;
}
export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      pollingInterval: 5,
      jobsPerPage: 10,
      confirmJobActions: true,
      confirmQueueActions: true,
      darkMode: window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)').matches : false,
      setSettings: (settings) => set(() => settings),
    }),
    {
      name: 'board-settings',
    }
  )
);
