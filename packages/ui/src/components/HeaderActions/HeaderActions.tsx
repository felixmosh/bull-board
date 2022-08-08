import React, { useState, Suspense } from 'react';
import { Redis } from '../Icons/Redis';
import { Button } from '../JobCard/Button/Button';
import s from './HeaderActions.module.css';

type ModalTypes = 'redis';
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

const RedisStatsModalLazy = React.lazy(() =>
  import('../RedisStatsModal/RedisStatsModal').then(({ RedisStatsModal }) => ({
    default: RedisStatsModal,
  }))
);

export const HeaderActions = () => {
  const [openedModal, setModalOpen] = useState<AllModalTypes>(null);
  return (
    <>
      <ul className={s.actions}>
        <li>
          <Button onClick={() => setModalOpen('redis')} className={s.button}>
            <Redis />
          </Button>
        </li>
      </ul>
      <Suspense fallback={null}>
        {(openedModal === 'redis' || openedModal === 'redisClosing') && (
          <RedisStatsModalLazy
            open={openedModal === 'redis'}
            onClose={waitForClosingAnimation('redis', setModalOpen)}
          />
        )}
      </Suspense>
    </>
  );
};
