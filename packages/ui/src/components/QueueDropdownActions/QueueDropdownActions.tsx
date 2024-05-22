import { AppQueue } from '@bull-board/api/typings/app';
import { Item, Portal, Root, Trigger } from '@radix-ui/react-dropdown-menu';
import React, { Suspense, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { QueueActions } from '../../../typings/app';
import { Button } from '../Button/Button';
import { DropdownContent } from '../DropdownContent/DropdownContent';
import { AddIcon } from '../Icons/Add';
import { EllipsisVerticalIcon } from '../Icons/EllipsisVertical';
import { PauseIcon } from '../Icons/Pause';
import { PlayIcon } from '../Icons/Play';
import { TrashIcon } from '../Icons/Trash';
import s from './QueueDropdownActions.module.css';

type ModalTypes = 'addJobs';
type AllModalTypes = ModalTypes | `${ModalTypes}Closing` | null;

function waitForClosingAnimation(
  state: ModalTypes,
  setModalOpen: (newState: AllModalTypes) => void
) {
  return () => {
    setModalOpen(`${state}Closing`);
    setTimeout(() => setModalOpen(null), 300); // fadeout animation duration
  };
}

const AddJobModalLazy = React.lazy(() =>
  import('../AddJobModal/AddJobModal').then(({ AddJobModal }) => ({
    default: AddJobModal,
  }))
);

export const QueueDropdownActions = ({
  queue,
  actions,
}: {
  queue: AppQueue;
  actions: QueueActions;
}) => {
  const { t } = useTranslation();
  const [openedModal, setModalOpen] = useState<AllModalTypes>(null);
  return (
    <Root>
      <Trigger asChild>
        <Button className={s.trigger}>
          <EllipsisVerticalIcon />
        </Button>
      </Trigger>

      <Portal>
        <DropdownContent align="end">
          <Item onSelect={() => setModalOpen('addJobs')}>
            <AddIcon />
            {t('QUEUE.ACTIONS.ADD_JOB')}
          </Item>
          <Item
            onSelect={
              queue.isPaused ? actions.resumeQueue(queue.name) : actions.pauseQueue(queue.name)
            }
          >
            {queue.isPaused ? (
              <>
                <PlayIcon />
                {t('QUEUE.ACTIONS.RESUME')}
              </>
            ) : (
              <>
                <PauseIcon />
                {t('QUEUE.ACTIONS.PAUSE')}
              </>
            )}
          </Item>
          <Item onSelect={actions.emptyQueue(queue.name)}>
            <TrashIcon />
            {t('QUEUE.ACTIONS.EMPTY')}
          </Item>
        </DropdownContent>
      </Portal>
      <Suspense fallback={null}>
        {(openedModal === 'addJobs' || openedModal === 'addJobsClosing') && (
          <AddJobModalLazy
            open={openedModal === 'addJobs'}
            onClose={waitForClosingAnimation('addJobs', setModalOpen)}
            actions={actions}
            queue={queue}
          />
        )}
      </Suspense>
    </Root>
  );
};
