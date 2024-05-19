import React, { Suspense } from 'react';
import { useModal } from '../../hooks/useModal';
import { useUIConfig } from '../../hooks/useUIConfig';
import { Button } from '../Button/Button';
import { CustomLinksDropdown } from '../CustomLinksDropdown/CustomLinksDropdown';
import { FullscreenIcon } from '../Icons/Fullscreen';
import { RedisIcon } from '../Icons/Redis';
import { Settings } from '../Icons/Settings';
import s from './HeaderActions.module.css';

type ModalTypes = 'redis' | 'settings';

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
  const { miscLinks = [] } = useUIConfig();
  const modal = useModal<ModalTypes>();

  return (
    <>
      <ul className={s.actions}>
        <li>
          <Button onClick={() => modal.open('redis')} className={s.button}>
            <RedisIcon />
          </Button>
        </li>
        <li>
          <Button onClick={onClickFullScreen} className={s.button}>
            <FullscreenIcon />
          </Button>
        </li>
        <li>
          <Button onClick={() => modal.open('settings')} className={s.button}>
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
        {modal.isMounted('redis') && (
          <RedisStatsModalLazy open={modal.isOpen('redis')} onClose={modal.close('redis')} />
        )}
        {modal.isMounted('settings') && (
          <SettingsModalLazy open={modal.isOpen('settings')} onClose={modal.close('settings')} />
        )}
      </Suspense>
    </>
  );
};
