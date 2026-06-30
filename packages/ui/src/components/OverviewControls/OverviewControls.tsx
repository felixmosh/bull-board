import React from 'react';
import { useTranslation } from 'react-i18next';
import { useOverviewState } from '../../hooks/useMenuState';
import { Button } from '../Button/Button';
import { ChevronDown } from '../Icons/ChevronDown';
import s from './OverviewControls.module.css';

interface OverviewControlsProps {
  grouped: boolean;
  groupPaths: string[];
}

export const OverviewControls = ({ grouped, groupPaths }: OverviewControlsProps) => {
  const { t } = useTranslation();
  const { expandAll, collapseAll, isMenuOpen } = useOverviewState(
    ({ expandAll, collapseAll, isMenuOpen }) => ({ expandAll, collapseAll, isMenuOpen })
  );

  if (!grouped) {
    return null;
  }

  const allExpanded = groupPaths.every((path) => isMenuOpen(path));
  const allCollapsed = groupPaths.every((path) => !isMenuOpen(path));

  return (
    <div className={s.expandActions}>
      <Button
        theme="basic"
        compact
        className={s.expandButton}
        onClick={() => expandAll(groupPaths)}
        title={t('MENU.EXPAND_ALL')}
        aria-label={t('MENU.EXPAND_ALL')}
        disabled={allExpanded}
      >
        <ChevronDown className={s.expandIcon} />
      </Button>
      <Button
        theme="basic"
        compact
        className={s.expandButton}
        onClick={() => collapseAll(groupPaths)}
        title={t('MENU.COLLAPSE_ALL')}
        aria-label={t('MENU.COLLAPSE_ALL')}
        disabled={allCollapsed}
      >
        <ChevronDown className={s.collapseIcon} />
      </Button>
    </div>
  );
};
