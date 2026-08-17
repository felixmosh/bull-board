import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DEFAULT_LATENCY_SERIES, LatencySeriesKey } from '../components/LatencyChart/latencySeries';
import { TabsType } from './useDetailsTabs';
import { QueueSortKey, SortDirection } from './useSortQueues';

/** Which pane the throughput/latency chart tab switcher shows. */
export type MetricsChartTab = 'throughput' | 'latency';

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
  darkMode: boolean;
  /** 'default' means no explicit preference: fall back to whichever tab renders first. */
  defaultJobTab: TabsType | 'default';
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
      darkMode: window.matchMedia('(prefers-color-scheme: dark)').matches,
      defaultJobTab: 'Data',
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
    }
  )
);
