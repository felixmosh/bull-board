import { useEffect, useState } from 'react';
import { Status } from '@wirdo-bullboard/api/typings/app';
import { STATUSES } from '@wirdo-bullboard/api/src/constants/statuses';
import { useSettingsStore } from './useSettings';

export const availableJobTabs = ['Data', 'Options', 'Logs', 'Error'] as const;

export type TabsType = (typeof availableJobTabs)[number];

export function useDetailsTabs(currentStatus: Status, isJobFailed: boolean) {
  const [tabs, updateTabs] = useState<TabsType[]>([]);
  const { defaultJobTab } = useSettingsStore();

  const [selectedTab, setSelectedTab] = useState<TabsType>(
    tabs.find((tab) => tab === defaultJobTab) || tabs[0]
  );

  useEffect(() => {
    let nextState = availableJobTabs.filter((tab) => tab !== 'Error');
    if (isJobFailed) {
      nextState = [...nextState, 'Error'];
    } else if (currentStatus === STATUSES.failed) {
      nextState = ['Error', ...nextState];
    }

    updateTabs(nextState);
  }, [currentStatus]);

  useEffect(() => {
    if (!tabs.includes(defaultJobTab)) {
      setSelectedTab(tabs[0]);
    } else {
      setSelectedTab(defaultJobTab);
    }
  }, [defaultJobTab, tabs]);

  return {
    tabs: tabs?.map((title) => ({
      title,
      isActive: title === selectedTab,
      selectTab: () => setSelectedTab(title),
    })),
    selectedTab,
  };
}
