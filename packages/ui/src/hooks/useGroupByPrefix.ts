import { useSettingsStore } from './useSettings';
import { useUIConfig } from './useUIConfig';

/** The user's choice when they made one, otherwise the board's `uiConfig.overview.groupByPrefix`. */
export function useGroupByPrefix(): boolean {
  const setting = useSettingsStore((state) => state.groupByPrefix);
  const fallback = useUIConfig().overview?.groupByPrefix ?? false;
  return setting ?? fallback;
}
