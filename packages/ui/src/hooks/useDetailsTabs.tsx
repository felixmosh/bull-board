import { STATUSES } from '@bull-board/api/src/constants/statuses';
import { Status } from '@bull-board/api/typings/app';
import { useEffect, useState } from 'react';
import { useSettingsStore } from './useSettings';

export const availableJobTabs = ['Data', 'Options', 'Logs', 'Error'] as const;

export type TabsType = (typeof availableJobTabs)[number];

export function useDetailsTabs(currentStatus: Status) {
  const [tabs, updateTabs] = useState<TabsType[]>([]);
  const { defaultJobTab } = useSettingsStore();

  const [selectedTab, setSelectedTab] = useState<TabsType>(
    tabs.find((tab) => tab === defaultJobTab) || tabs[0]
  );

  useEffect(() => {
    let nextTabs: TabsType[] = availableJobTabs.filter((tab) => tab !== 'Error');
    if (currentStatus === STATUSES.failed) {
      nextTabs = ['Error', ...nextTabs];
    } else {
      nextTabs = [...nextTabs, 'Error'];
    }

    updateTabs(nextTabs);
  }, [currentStatus]);

  useEffect(() => {
    if (!tabs.includes(defaultJobTab) || currentStatus === STATUSES.failed) {
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
