import { Menu } from '@base-ui/react/menu';
import cn from 'clsx';
import { useTranslation } from 'react-i18next';
import { useHistory } from 'react-router-dom';
import { useActiveQueueName } from '../../../hooks/useActiveQueueName';
import { useQueues } from '../../../hooks/useQueues';
import { links } from '../../../utils/links';
import { DropdownContent } from '../../DropdownContent/DropdownContent';
import s from './MobileQueueDropdown.module.css';

export const MobileQueueDropdown = () => {
  const { t } = useTranslation();
  const { queues } = useQueues();
  const activeQueueName = useActiveQueueName();
  const history = useHistory();

  const currentQueue = queues?.find((queue) => queue.name === activeQueueName);
  const displayName = currentQueue?.name || t('MENU.OVERVIEW');

  const handleQueueSelect = (queueName: string) => {
    const { pathname, search } = links.queuePage(queueName);
    history.push({ pathname, search });
  };

  const handleOverviewSelect = () => {
    history.push('/');
  };

  return (
    <Menu.Root>
      <Menu.Trigger className={cn('select', s.trigger)}>
        <span className={s.currentQueue}>{displayName}</span>
      </Menu.Trigger>

      <Menu.Portal>
        <Menu.Positioner sideOffset={5} style={{ zIndex: 100 }}>
          <DropdownContent className={s.content}>
            <Menu.Item
              className={cn(s.item, { [s.active]: !activeQueueName })}
              onClick={handleOverviewSelect}
            >
              {t('MENU.OVERVIEW')}
            </Menu.Item>

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
