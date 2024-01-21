import { useEffect, useState } from 'react';
import { Status } from '@bull-board/api/typings/app';
import { STATUSES } from '@bull-board/api/src/constants/statuses';
import { useSettingsStore } from './useSettings';

export const availableJobTabs = ['Data', 'Options', 'Logs', 'Error'] as const;

export type TabsType = (typeof availableJobTabs)[number];

const FALLBACK_TAB: TabsType = 'Data';

export function useDetailsTabs(currentStatus: Status, isJobFailed: boolean) {
  const [tabs, updateTabs] = useState<TabsType[]>([]);
  const { defaultJobTab } = useSettingsStore();

  const [selectedTab, setSelectedTab] = useState<TabsType>(defaultJobTab);

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
      setSelectedTab(FALLBACK_TAB);
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
