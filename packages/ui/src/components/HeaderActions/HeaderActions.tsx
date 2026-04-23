import cn from 'clsx';
import React, { Suspense } from 'react';
import { useModal } from '../../hooks/useModal';
import { useUIConfig } from '../../hooks/useUIConfig';
import { Button } from '../Button/Button';
import buttonStyles from '../Button/Button.module.css';
import { CustomLinksDropdown } from '../CustomLinksDropdown/CustomLinksDropdown';
import { DocsIcon } from '../Icons/Docs';
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

const DOCS_URL = 'https://felixmosh.github.io/bull-board/';
const DOCS_LABEL = 'Docs';

export const HeaderActions = () => {
  const { miscLinks = [], hideRedisDetails = false, hideDocsLink = false } = useUIConfig();
  const modal = useModal<ModalTypes>();

  return (
    <>
      <ul className={s.actions}>
        {!hideRedisDetails && (
          <li>
            <Button onClick={() => modal.open('redis')} className={s.button}>
              <RedisIcon />
            </Button>
          </li>
        )}
        {!hideDocsLink && (
          <li>
            <a
              href={DOCS_URL}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={DOCS_LABEL}
              title={DOCS_LABEL}
              className={cn(s.button, buttonStyles.button, buttonStyles.default)}
            >
              <DocsIcon />
            </a>
          </li>
        )}
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
        {!hideRedisDetails && modal.isMounted('redis') && (
          <RedisStatsModalLazy open={modal.isOpen('redis')} onClose={modal.close('redis')} />
        )}
        {modal.isMounted('settings') && (
          <SettingsModalLazy open={modal.isOpen('settings')} onClose={modal.close('settings')} />
        )}
      </Suspense>
    </>
  );
};
