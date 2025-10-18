import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useHistory, useLocation } from 'react-router-dom';
import s from './JobNameFilter.module.css';

interface JobNameFilterProps {
  queueName: string;
}

export const JobNameFilter: React.FC<JobNameFilterProps> = () => {
  const { t } = useTranslation();
  const history = useHistory();
  const location = useLocation();
  const [filter, setFilter] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const nameFilter = params.get('nameFilter') || '';
    setFilter(nameFilter);
  }, [location.search]);

  const handleFilterChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setFilter(value);
  };

  const handleFilterApply = () => {
    const params = new URLSearchParams(location.search);
    if (filter) {
      params.set('nameFilter', filter);
    } else {
      params.delete('nameFilter');
    }
    // Reset to page 1 when filtering
    params.set('page', '1');
    history.push(`${location.pathname}?${params.toString()}`);
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleFilterApply();
    }
  };

  const handleClear = () => {
    setFilter('');
    const params = new URLSearchParams(location.search);
    params.delete('nameFilter');
    params.set('page', '1');
    history.push(`${location.pathname}?${params.toString()}`);
  };

  return (
    <div className={s.jobNameFilter}>
      <input
        type="text"
        value={filter}
        onChange={handleFilterChange}
        onKeyPress={handleKeyPress}
        placeholder={t('QUEUE.FILTER_BY_JOB_NAME') || 'Filter by job name...'}
        className={s.input}
      />
      <button
        onClick={handleFilterApply}
        className={s.button}
        disabled={!filter && !location.search.includes('nameFilter')}
      >
        {t('QUEUE.FILTER') || 'Filter'}
      </button>
      {filter && (
        <button
          onClick={handleClear}
          className={s.clearButton}
        >
          {t('QUEUE.CLEAR') || 'Clear'}
        </button>
      )}
    </div>
  );
};