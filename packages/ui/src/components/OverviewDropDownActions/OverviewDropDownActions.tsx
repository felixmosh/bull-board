import { Menu } from '@base-ui/react/menu';
import type { AppQueue } from '@bull-board/api/typings/app';
import { useTranslation } from 'react-i18next';
import { QueueActions } from '../../../typings/app';
import type { QueueSortKey, SortDirection } from '../../hooks/useSortQueues';
import { dynamicTranslationKey } from '../../utils/dynamicTranslationKey';
import { retriableFailedJobs } from '../../utils/failedRetries';
import { Button } from '../Button/Button';
import { EllipsisVerticalIcon } from '../Icons/EllipsisVertical';
import { PauseIcon } from '../Icons/Pause';
import { PlayIcon } from '../Icons/Play';
import { RetryIcon } from '../Icons/Retry';
import { SortIcon } from '../Icons/Sort';
import { SortDirectionDown } from '../Icons/SortDirectionDown';
import { SortDirectionUp } from '../Icons/SortDirectionUp';
import s from './OverviewDropDownActions.module.css';

type OverviewActionsProps = {
  actions: QueueActions;
  queues: AppQueue[] | null;
  onSort: (sortKey: QueueSortKey) => void;
  sortBy: QueueSortKey;
  sortDirection: SortDirection;
};

const sortOptions: QueueSortKey[] = [
  'alphabetical',
  'failed',
  'completed',
  'active',
  'waiting',
  'delayed',
];

export const OverviewActions = ({
  actions,
  queues,
  onSort,
  sortBy,
  sortDirection,
}: OverviewActionsProps) => {
  const { t } = useTranslation();

  if (!queues) {
    return null;
  }

  const areAllPaused = queues.every((queue) => queue.isPaused);
  const areAllReadOnly = queues.every((queue) => queue.readOnlyMode);
  const retriable = retriableFailedJobs(queues);
  const SortDir = sortDirection === 'asc' ? <SortDirectionDown /> : <SortDirectionUp />;

  return (
    <Menu.Root>
      <Menu.Trigger
        render={
          <Button>
            <EllipsisVerticalIcon />
          </Button>
        }
      />

      <Menu.Portal>
        <Menu.Positioner align="end" style={{ zIndex: 100 }}>
          <Menu.Popup className={s.dropdown}>
            {areAllReadOnly ? null : (
              <>
                {areAllPaused ? (
                  <Menu.Item className={s.item} onClick={actions.resumeAll}>
                    <PlayIcon />
                    {t('QUEUE.ACTIONS.RESUME_ALL')}
                  </Menu.Item>
                ) : (
                  <Menu.Item className={s.item} onClick={actions.pauseAll}>
                    <PauseIcon />
                    {t('QUEUE.ACTIONS.PAUSE_ALL')}
                  </Menu.Item>
                )}
                {retriable.queueNames.length > 0 && (
                  <Menu.Item className={s.item} onClick={actions.retryFailedInQueues(retriable)}>
                    <RetryIcon />
                    {t('QUEUE.ACTIONS.RETRY_FAILED_IN_ALL_QUEUES', { count: retriable.jobCount })}
                  </Menu.Item>
                )}
                <Menu.Separator />
              </>
            )}
            <Menu.SubmenuRoot>
              <Menu.SubmenuTrigger className={s.subTrigger}>
                <SortIcon />
                {t('DASHBOARD.SORTING.TITLE')}
              </Menu.SubmenuTrigger>
              <Menu.Positioner sideOffset={2} style={{ zIndex: 100 }}>
                <Menu.Popup className={s.subDropdown}>
                  {sortOptions.map((key) => (
                    <Menu.Item
                      className={s.subItem}
                      key={key}
                      onClick={() => onSort(key as QueueSortKey)}
                    >
                      {t(dynamicTranslationKey(`DASHBOARD.SORTING.${key.toUpperCase()}`))}
                      {sortBy === key && SortDir}
                    </Menu.Item>
                  ))}
                </Menu.Popup>
              </Menu.Positioner>
            </Menu.SubmenuRoot>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
};

export default OverviewActions;
