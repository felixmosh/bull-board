import { STATUSES } from '@bull-board/api/constants/statuses';
import type { JobDetailsTab, Status } from '@bull-board/api/typings/app';
import { useEffect, useState } from 'react';
import { useSettingsStore } from './useSettings';
import { useUIConfig } from './useUIConfig';

export const availableJobTabs = [
  'Data',
  'Progress',
  'Options',
  'Logs',
  'Error',
  'Timeline',
] as const satisfies readonly JobDetailsTab[];

export type TabsType = (typeof availableJobTabs)[number];

/** The viewer has expressed no preference and wants whatever suits the job in front of them. */
export const DEFAULT_JOB_TAB = 'default';

export type JobTabPreference = TabsType | typeof DEFAULT_JOB_TAB;

/**
 * The viewer's own choice wins, then the board-wide default an operator configured, then the tab
 * order itself, whose first entry is already status-aware: Error for a failed job, Data otherwise.
 * A tab that does not apply to this job falls through rather than blanking the panel.
 */
export function resolveSelectedTab(
  tabs: TabsType[],
  preference: JobTabPreference,
  configuredDefault: JobDetailsTab | undefined
): TabsType {
  if (preference !== DEFAULT_JOB_TAB && tabs.includes(preference)) {
    return preference;
  }

  if (configuredDefault && tabs.includes(configuredDefault)) {
    return configuredDefault;
  }

  return tabs[0];
}

export function useDetailsTabs(params: { currentStatus: Status; withTimeline: boolean }) {
  const [tabs, updateTabs] = useState<TabsType[]>([]);
  const { defaultJobTab } = useSettingsStore();
  const configuredDefault = useUIConfig()?.jobDetails?.defaultTab;

  const [selectedTab, setSelectedTab] = useState<TabsType>(
    resolveSelectedTab(tabs, defaultJobTab, configuredDefault)
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
    setSelectedTab(resolveSelectedTab(tabs, defaultJobTab, configuredDefault));
  }, [defaultJobTab, configuredDefault, tabs]);

  return {
    tabs: tabs?.map((title) => ({
      title,
      isActive: title === selectedTab,
      selectTab: () => setSelectedTab(title),
    })),
    selectedTab,
  };
}
