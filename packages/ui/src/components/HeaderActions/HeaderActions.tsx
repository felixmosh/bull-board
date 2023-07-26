import React, { useState, Suspense } from 'react';
import { useUIConfig } from '../../hooks/useUIConfig';
import { CustomLinksDropdown } from '../CustomLinksDropdown/CustomLinksDropdown';
import { FullscreenIcon } from '../Icons/Fullscreen';
import { RedisIcon } from '../Icons/Redis';
import { Settings } from '../Icons/Settings';
import { Button } from '../JobCard/Button/Button';
import s from './HeaderActions.module.css';

type ModalTypes = 'redis' | 'settings';
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

const SettingsModalLazy = React.lazy(() =>
  import('../SettingsModal/SettingsModal').then(({ SettingsModal }) => ({
    default: SettingsModal,
  }))
);

const onClickFullScreen = async () => {
  const el = document.documentElement;
  if (!!el && document.fullscreenElement !== el) return await el.requestFullscreen();
  return document.exitFullscreen();
};

export const HeaderActions = () => {
  const [openedModal, setModalOpen] = useState<AllModalTypes>(null);
  const { miscLinks = [], showJobsPerPage = true } = useUIConfig();

  return (
    <>
      <ul className={s.actions}>
        <li>
          <Button onClick={() => setModalOpen('redis')} className={s.button}>
            <RedisIcon />
          </Button>
        </li>
        <li>
          <Button onClick={onClickFullScreen} className={s.button}>
            <FullscreenIcon />
          </Button>
        </li>
        <li>
          <Button onClick={() => setModalOpen('settings')} className={s.button}>
            <Settings />
          </Button>
        </li>
        {miscLinks.length > 0 && (
          <li>
            <CustomLinksDropdown options={miscLinks} className={s.button} />
          </li>
        )}
      </ul>
      <Suspense fallback={null}>
        {(openedModal === 'redis' || openedModal === 'redisClosing') && (
          <RedisStatsModalLazy
            open={openedModal === 'redis'}
            onClose={waitForClosingAnimation('redis', setModalOpen)}
          />
        )}
        {(openedModal === 'settings' || openedModal === 'settingsClosing') && (
          <SettingsModalLazy
            open={openedModal === 'settings'}
            onClose={waitForClosingAnimation('settings', setModalOpen)}
            showJobsPerPage={showJobsPerPage}
          />
        )}
      </Suspense>
    </>
  );
};
