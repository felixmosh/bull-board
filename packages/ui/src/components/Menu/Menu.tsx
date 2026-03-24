import React, { useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMenuState } from '../../hooks/useMenuState';
import { useQueueSearch } from '../../hooks/useQueueSearch';
import { useQueues } from '../../hooks/useQueues';
import { useSettingsStore } from '../../hooks/useSettings';
import { collectGroupPaths, toTree } from '../../utils/toTree';
import { ChevronDown } from '../Icons/ChevronDown';
import { GitHub } from '../Icons/GitHub';
import { SearchIcon } from '../Icons/Search';
import s from './Menu.module.css';
import { MenuTree } from './MenuTree/MenuTree';

export const Menu = () => {
  const { t } = useTranslation();
  const { queues } = useQueues();
  const sortQueues = useSettingsStore((state) => state.sortQueues);
  const { searchTerm, setSearchTerm } = useQueueSearch();

  const { expandAll, collapseAll, isMenuOpen } = useMenuState(
    ({ expandAll, collapseAll, isMenuOpen }) => ({
      expandAll,
      collapseAll,
      isMenuOpen,
    })
  );

  const navRef = useRef<HTMLElement>(null);
  const [canScrollUp, setCanScrollUp] = useState(false);
  const [canScrollDown, setCanScrollDown] = useState(false);

  const updateScrollState = useCallback(() => {
    const el = navRef.current;
    if (!el) return;
    setCanScrollUp(el.scrollTop > 0);
    setCanScrollDown(el.scrollTop + el.clientHeight < el.scrollHeight - 1);
  }, []);

  const navRefCallback = useCallback(
    (node: HTMLElement | null) => {
      (navRef as React.MutableRefObject<HTMLElement | null>).current = node;
      if (node) {
        updateScrollState();
        const observer = new ResizeObserver(updateScrollState);
        observer.observe(node);
      }
    },
    [updateScrollState]
  );

  const tree = toTree(
    queues?.filter((queue: any) =>
      queue.name?.toLowerCase().includes(searchTerm?.toLowerCase() as string)
    ) || [],
    sortQueues
  );

  const groupPaths = useMemo(() => collectGroupPaths(tree), [tree]);
  const hasGroups = groupPaths.length > 0;
  const allExpanded = hasGroups && groupPaths.every((p) => isMenuOpen(p));
  const allCollapsed = hasGroups && groupPaths.every((p) => !isMenuOpen(p));

  return (
    <aside className={s.aside}>
      <div className={s.menuHeader}>
        <span className={s.secondary}>{t('MENU.QUEUES')}</span>
        {hasGroups && (
          <span className={s.toggleActions}>
            <button
              className={s.toggleBtn}
              onClick={() => expandAll(groupPaths)}
              title={t('MENU.EXPAND_ALL')}
              disabled={allExpanded}
            >
              <ChevronDown className={s.expandIcon} />
            </button>
            <button
              className={s.toggleBtn}
              onClick={() => collapseAll(groupPaths)}
              title={t('MENU.COLLAPSE_ALL')}
              disabled={allCollapsed}
            >
              <ChevronDown className={s.collapseIcon} />
            </button>
          </span>
        )}
      </div>
      <div className={s.searchWrapper}>
        <SearchIcon />
        <input
          className={s.search}
          type="search"
          id="search-queues"
          placeholder={t('MENU.SEARCH_INPUT_PLACEHOLDER')}
          value={searchTerm}
          onChange={({ currentTarget }) => setSearchTerm(currentTarget.value)}
        />
      </div>
      <div className={s.navWrapper}>
        {canScrollUp && <div className={s.fadeTop} />}
        <nav ref={navRefCallback} onScroll={updateScrollState}>
          <MenuTree tree={tree} />
        </nav>
        {canScrollDown && <div className={s.fadeBottom} />}
      </div>
      <a
        className={s.appVersion}
        target="_blank"
        rel="noreferrer"
        href={process.env.BULL_BOARD_REPO}
      >
        <GitHub className={s.githubIcon} />
        {process.env.APP_VERSION}
      </a>
    </aside>
  );
};
