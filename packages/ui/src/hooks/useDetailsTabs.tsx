import { STATUSES } from '@bull-board/api/constants/statuses';
import type { Status } from '@bull-board/api/typings/app';
import { useEffect, useState } from 'react';
import { useSettingsStore } from './useSettings';

export const availableJobTabs = ['Data', 'Options', 'Logs', 'Error', 'Timeline'] as const;

export type TabsType = (typeof availableJobTabs)[number];

export function useDetailsTabs(params: { currentStatus: Status; withTimeline: boolean }) {
  const [tabs, updateTabs] = useState<TabsType[]>([]);
  const { defaultJobTab } = useSettingsStore();

  const [selectedTab, setSelectedTab] = useState<TabsType>(
    tabs.find((tab) => tab === defaultJobTab) || tabs[0]
  );

  useEffect(() => {
    let nextTabs: TabsType[] = availableJobTabs.filter(
      (tab) => tab !== 'Error' && tab !== 'Timeline'
    );
    if (params.currentStatus === STATUSES.failed) {
      nextTabs = ['Error', ...nextTabs];
    } else {
      nextTabs = [...nextTabs, 'Error'];
    }

    if (params.withTimeline) {
      nextTabs.push('Timeline');
    }

    updateTabs(nextTabs);
  }, [params.currentStatus, params.withTimeline]);

  useEffect(() => {
    setSelectedTab(tabs.includes(defaultJobTab) ? defaultJobTab : tabs[0]);
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
