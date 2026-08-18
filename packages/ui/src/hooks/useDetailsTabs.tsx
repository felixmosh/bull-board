import { STATUSES } from '@bull-board/api/constants/statuses';
import type { JobDetailsTab, Status } from '@bull-board/api/typings/app';
import { useEffect, useMemo, useState } from 'react';
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

export const DEFAULT_JOB_TAB = 'default';

export type JobTabPreference = TabsType | typeof DEFAULT_JOB_TAB;

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

function buildTabs(currentStatus: Status, withTimeline: boolean): TabsType[] {
  const base = availableJobTabs.filter((tab) => tab !== 'Error' && tab !== 'Timeline');
  const tabs: TabsType[] =
    currentStatus === STATUSES.failed ? ['Error', ...base] : [...base, 'Error'];

  return withTimeline ? [...tabs, 'Timeline'] : tabs;
}

export function useDetailsTabs(params: { currentStatus: Status; withTimeline: boolean }) {
  const { defaultJobTab } = useSettingsStore();
  const configuredDefault = useUIConfig()?.jobDetails?.defaultTab;

  const tabs = useMemo(
    () => buildTabs(params.currentStatus, params.withTimeline),
    [params.currentStatus, params.withTimeline]
  );

  const [selectedTab, setSelectedTab] = useState<TabsType>(() =>
    resolveSelectedTab(tabs, defaultJobTab, configuredDefault)
  );

  useEffect(() => {
    setSelectedTab(resolveSelectedTab(tabs, defaultJobTab, configuredDefault));
  }, [defaultJobTab, configuredDefault, tabs]);

  return { tabs, selectedTab, selectTab: setSelectedTab };
}
