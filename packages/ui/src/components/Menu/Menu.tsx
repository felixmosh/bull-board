import cn from 'clsx';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { NavLink } from 'react-router-dom';
import { useSelectedStatuses } from '../../hooks/useSelectedStatuses';
import { links } from '../../utils/links';
import s from './Menu.module.css';
import { useCategoryQueues } from '../../hooks/useCategoryQueues';
import { AppQueue } from '@bull-board/api/typings/app';
import { SelectedStatuses } from '../../../typings/app';

export const Menu = () => {
  const { t } = useTranslation();

  const selectedStatuses = useSelectedStatuses();

  const {
    queuesByCategory,
    queuesByCategoryState,
    toggleCategoryState,
    collapseAllCategories,
    expandAllCategories,
    isAnyCategoryOpen,
  } = useCategoryQueues();

  const showCollapseAllButton = Object.keys(queuesByCategory || {}).length > 1;

  return (
    <aside className={s.aside}>
      <div className={s.secondary}>
        {t('MENU.QUEUES')}
        {showCollapseAllButton && (
          <a
            onClick={(e) => {
              e.preventDefault();
              isAnyCategoryOpen ? collapseAllCategories() : expandAllCategories();
            }}
          >
            {/* TODO: I am not sure where to add the i18n stuff */}
            {isAnyCategoryOpen ? 'Collapse All' : 'Expand All'}
          </a>
        )}
      </div>
      <nav>
        <ul className={s.menu}>
          {Object.entries(queuesByCategory).map(([category, queues]) => {
            const isOpen = queuesByCategoryState?.[category]?.isOpen || false;

            return (
              <li key={category}>
                <NavLink
                  to={'#'}
                  title={category}
                  className={s.categoryLink}
                  onClick={(e) => {
                    e.preventDefault();
                    toggleCategoryState(category);
                  }}
                >
                  {category} <span className={s.arrow}>{isOpen ? '▼' : '▶'}</span>
                </NavLink>

                {isOpen && <RegularList queues={queues} selectedStatuses={selectedStatuses} />}
              </li>
            );
          })}
        </ul>
      </nav>
      <div className={cn(s.appVersion, s.secondary)}>{process.env.APP_VERSION}</div>
    </aside>
  );
};

interface RegularListProps {
  queues: AppQueue[];
  selectedStatuses: SelectedStatuses;
}

const RegularList = ({ queues, selectedStatuses }: RegularListProps) => {
  const { t } = useTranslation();

  return (
    <ul>
      {queues.map(({ name: queueName, isPaused }) => (
        <li key={queueName}>
          <NavLink
            to={links.queuePage(queueName, selectedStatuses)}
            activeClassName={s.active}
            className={s.subMenuLink}
            title={queueName}
          >
            {queueName} {isPaused && <span className={s.isPaused}>[ {t('MENU.PAUSED')} ]</span>}
          </NavLink>
        </li>
      ))}
    </ul>
  );
};
