import React from 'react';
import { useTranslation } from 'react-i18next';
import { useSettingsStore } from '../../hooks/useSettings';
import { Button } from '../Button/Button';
import { SidebarIcon } from '../Icons/Sidebar';
import s from './SidebarToggle.module.css';

export const SidebarToggle = () => {
  const { t } = useTranslation();
  const collapsed = useSettingsStore((state) => state.sidebarCollapsed);
  const setSettings = useSettingsStore((state) => state.setSettings);

  const label = collapsed ? t('MENU.EXPAND_SIDEBAR') : t('MENU.COLLAPSE_SIDEBAR');

  return (
    <Button
      className={s.toggle}
      onClick={() => setSettings({ sidebarCollapsed: !collapsed })}
      aria-expanded={!collapsed}
      aria-controls="bull-board-sidebar"
      aria-label={label}
      title={label}
    >
      <SidebarIcon className={s.icon} />
    </Button>
  );
};
