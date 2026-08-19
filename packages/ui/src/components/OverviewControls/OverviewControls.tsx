import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';
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
  const expandAll = useOverviewState((state) => state.expandAll);
  const collapseAll = useOverviewState((state) => state.collapseAll);
  const { allExpanded, allCollapsed } = useOverviewState(
    useShallow((state) => ({
      allExpanded: groupPaths.every((path) => state.isMenuOpen(path)),
      allCollapsed: groupPaths.every((path) => !state.isMenuOpen(path)),
    }))
  );

  if (!grouped) {
    return null;
  }

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
