import { Menu } from '@base-ui/react/menu';
import cn from 'clsx';
import { useTranslation } from 'react-i18next';
import { useHistory, useLocation } from 'react-router-dom';
import { useActiveQueueName } from '../../../hooks/useActiveQueueName';
import { useQueues } from '../../../hooks/useQueues';
import { useUIConfig } from '../../../hooks/useUIConfig';
import { links } from '../../../utils/links';
import { DropdownContent } from '../../DropdownContent/DropdownContent';
import s from './MobileQueueDropdown.module.css';

export const MobileQueueDropdown = () => {
  const { t } = useTranslation();
  const { queues } = useQueues();
  const activeQueueName = useActiveQueueName();
  const { hasHistoryProvider = false } = useUIConfig();
  const history = useHistory();
  const { pathname } = useLocation();

  const currentQueue = queues?.find((queue) => queue.name === activeQueueName);
  const showJobSchedulers = queues?.some((queue) => queue.jobSchedulerCount > 0);

  /* The sidebar is gone at this width, so its nav links have nowhere else to live. */
  const pages = [
    { path: '/', label: t('MENU.OVERVIEW'), show: true },
    { path: '/metrics-history', label: t('MENU.METRICS_HISTORY'), show: hasHistoryProvider },
    { path: '/job-schedulers', label: t('MENU.SCHEDULERS'), show: !!showJobSchedulers },
  ].filter((page) => page.show);

  const activePage = activeQueueName ? undefined : pages.find((page) => page.path === pathname);
  const displayName = currentQueue?.name || activePage?.label || t('MENU.OVERVIEW');

  const handleQueueSelect = (queueName: string) => {
    const { pathname: to, search } = links.queuePage(queueName);
    history.push({ pathname: to, search });
  };

  return (
    <Menu.Root>
      <Menu.Trigger className={cn('select', s.trigger)}>
        <span className={s.currentQueue}>{displayName}</span>
      </Menu.Trigger>

      <Menu.Portal>
        <Menu.Positioner sideOffset={5} style={{ zIndex: 100 }}>
          <DropdownContent className={s.content}>
            {pages.map((page) => (
              <Menu.Item
                key={page.path}
                className={cn(s.item, { [s.active]: activePage?.path === page.path })}
                onClick={() => history.push(page.path)}
              >
                {page.label}
              </Menu.Item>
            ))}

            {queues && queues.length > 0 && (
              <>
                <Menu.Separator className={s.separator} />
                {queues.map((queue) => (
                  <Menu.Item
                    key={queue.name}
                    className={cn(s.item, { [s.active]: queue.name === activeQueueName })}
                    onClick={() => handleQueueSelect(queue.name)}
                  >
                    <span className={s.queueName}>{queue.name}</span>
                    {queue.counts && (
                      <span className={s.queueStats}>
                        {Object.values(queue.counts).reduce(
                          (acc: number, val: any) => acc + (val || 0),
                          0
                        )}
                      </span>
                    )}
                  </Menu.Item>
                ))}
              </>
            )}
          </DropdownContent>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
};
