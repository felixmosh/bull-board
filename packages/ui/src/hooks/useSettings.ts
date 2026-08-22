import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DEFAULT_LATENCY_SERIES, LatencySeriesKey } from '../components/LatencyChart/latencySeries';
import { DEFAULT_JOB_TAB, JobTabPreference } from './useDetailsTabs';
import { QueueSortKey, SortDirection } from './useSortQueues';

/** Which pane the throughput/latency chart tab switcher shows. */
export type MetricsChartTab = 'throughput' | 'latency';

export type ThemePreference = 'system' | 'light' | 'dark';

interface SettingsState {
  language: string;
  pollingInterval: number;
  jobsPerPage: number;
  confirmQueueActions: boolean;
  confirmJobActions: boolean;
  collapseJob: boolean;
  collapseJobData: boolean;
  collapseJobProgress: boolean;
  collapseJobOptions: boolean;
  collapseJobError: boolean;
  collapseMetrics: boolean;
  defaultCollapseDepth: number;
  useCollapsibleJson: boolean;
  theme: ThemePreference;
  /** When false, the header environment badge is hidden even if uiConfig.environment is set. */
  showEnvBadge: boolean;
  defaultJobTab: JobTabPreference;
  sortQueues: boolean;
  sorting: { dashboard: { key: QueueSortKey; direction: SortDirection } };
  overview: { grouped?: boolean };
  sidebarCollapsed: boolean;
  /** One global preference for which latency-chart series are visible, shared by the queue
   *  detail page and the metrics history page rather than tracked per queue. */
  latencyChartSeries: LatencySeriesKey[];
  /** One global preference for which chart tab (throughput or latency) is showing, shared by
   *  the queue detail page and the metrics history page rather than tracked per queue. */
  metricsChartTab: MetricsChartTab;
  setSettings: (settings: Partial<Omit<SettingsState, 'setSettings'>>) => void;
}

export const SETTINGS_VERSION = 2;

type LegacySettings = Partial<SettingsState> & { darkMode?: boolean };

export function migrateSettings(persisted: unknown, version: number): SettingsState {
  let settings = persisted as LegacySettings | undefined;

  if (version === 0 && settings?.defaultJobTab === 'Data') {
    settings = { ...settings, defaultJobTab: DEFAULT_JOB_TAB };
  }

  if (version < 2 && settings && 'darkMode' in settings) {
    const { darkMode, ...rest } = settings;
    settings = { ...rest, theme: darkMode ? 'dark' : 'light' };
  }

  return settings as SettingsState;
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
      collapseJobProgress: false,
      collapseJobOptions: false,
      collapseJobError: false,
      collapseMetrics: false,
      defaultCollapseDepth: 3,
      useCollapsibleJson: true,
      theme: 'system',
      showEnvBadge: true,
      defaultJobTab: DEFAULT_JOB_TAB,
      sortQueues: false,
      sorting: { dashboard: { key: 'alphabetical', direction: 'asc' } },
      overview: {},
      sidebarCollapsed: false,
      latencyChartSeries: [...DEFAULT_LATENCY_SERIES],
      metricsChartTab: 'throughput',
      setSettings: (settings) => set(() => settings),
    }),
    {
      name: 'board-settings',
      version: SETTINGS_VERSION,
      migrate: migrateSettings,
    }
  )
);
