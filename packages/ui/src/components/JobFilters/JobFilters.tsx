import type { AppQueue, JobsOrder } from '@bull-board/api/typings/app';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  hasActiveJobFilters,
  JobFilters as Filters,
  useJobFilters,
} from '../../hooks/useJobFilters';
import { Button } from '../Button/Button';
import { SelectField } from '../Form/SelectField/SelectField';
import { CloseIcon } from '../Icons/Close';
import { FilterBuilder } from './FilterBuilder';
import s from './JobFilters.module.css';

const TYPING_DEBOUNCE_MS = 400;

/** A text input that follows the URL and writes back to it once typing pauses. */
function useDebouncedFilter(
  value: string,
  commit: (value: string) => void
): [string, (value: string) => void, () => void] {
  const [draft, setDraft] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Follows the URL when it changes underneath (back button, another queue, a shared link).
  useEffect(() => setDraft(value), [value]);
  useEffect(() => () => clearTimeout(timer.current ?? undefined), []);

  const change = (next: string) => {
    setDraft(next);
    clearTimeout(timer.current ?? undefined);
    timer.current = setTimeout(() => commit(next), TYPING_DEBOUNCE_MS);
  };
  const flush = () => {
    clearTimeout(timer.current ?? undefined);
    if (draft !== value) commit(draft);
  };
  return [draft, change, flush];
}

/** Examples of the search syntax; picking one puts it in the search field. */
const SEARCH_EXAMPLES = [
  { code: 'data.payload.organizationId = 77', help: 'QUEUE.FILTERS.SEARCH_HELP_EQUALS' },
  { code: "data.email ILIKE '%@hoopay.com.br'", help: 'QUEUE.FILTERS.SEARCH_HELP_LIKE' },
  { code: "data.status IN ('paid', 'refunded')", help: 'QUEUE.FILTERS.SEARCH_HELP_IN' },
  { code: 'data.coupon IS NULL', help: 'QUEUE.FILTERS.SEARCH_HELP_NULL' },
  { code: "name = 'webhook' AND data.amount >= 100", help: 'QUEUE.FILTERS.SEARCH_HELP_COMBINE' },
  { code: "$icontains(data.description, 'pix')", help: 'QUEUE.FILTERS.SEARCH_HELP_CONTAINS' },
] as const;

const ClearButton = ({ label, onClick }: { label: string; onClick: () => void }) => (
  <button type="button" className={s.clear} aria-label={label} title={label} onClick={onClick}>
    <CloseIcon />
  </button>
);

export const JobFilters = ({ queue }: { queue: AppQueue }) => {
  const { t } = useTranslation();
  const [filters, update] = useJobFilters();
  const set = (key: keyof Filters) => (value: string) => update({ [key]: value });

  const [jobId, changeJobId, flushJobId] = useDebouncedFilter(filters.jobId, set('jobId'));
  const [search, changeSearch, flushSearch] = useDebouncedFilter(filters.search, set('search'));

  const result = hasActiveJobFilters(filters) ? queue.search : undefined;
  const [builderOpen, setBuilderOpen] = useState(false);

  return (
    <div className={s.filters}>
      <div className={s.row}>
        <label className={s.field}>
          <span className={s.label}>{t('QUEUE.FILTERS.JOB_ID')}</span>
          <span className={s.control}>
            <input
              type="text"
              className={s.input}
              value={jobId}
              autoComplete="off"
              spellCheck={false}
              onChange={({ currentTarget }) => changeJobId(currentTarget.value)}
              onKeyDown={(event) => event.key === 'Enter' && flushJobId()}
            />
            {jobId && (
              <ClearButton
                label={t('QUEUE.FILTERS.CLEAR')}
                onClick={() => {
                  changeJobId('');
                  update({ jobId: '' });
                }}
              />
            )}
          </span>
        </label>

        <div className={s.field}>
          <span className={s.label} id="job-filters-order">
            {t('QUEUE.FILTERS.ORDER')}
          </span>
          <SelectField
            className={s.select}
            aria-labelledby="job-filters-order"
            value={filters.order}
            onChange={(order) => update({ order: order as JobsOrder })}
            options={[
              { value: 'desc', text: t('QUEUE.FILTERS.ORDER_DESC') },
              { value: 'asc', text: t('QUEUE.FILTERS.ORDER_ASC') },
            ]}
          />
        </div>

        <label className={`${s.field} ${s.searchField}`}>
          <span className={s.label}>{t('QUEUE.FILTERS.SEARCH')}</span>
          <span className={s.control}>
            <input
              type="text"
              className={`${s.input} ${s.code}`}
              value={search}
              placeholder={t('QUEUE.FILTERS.SEARCH_PLACEHOLDER')}
              autoComplete="off"
              spellCheck={false}
              onChange={({ currentTarget }) => changeSearch(currentTarget.value)}
              onKeyDown={(event) => event.key === 'Enter' && flushSearch()}
            />
            {search && (
              <ClearButton
                label={t('QUEUE.FILTERS.CLEAR')}
                onClick={() => {
                  changeSearch('');
                  update({ search: '' });
                }}
              />
            )}
          </span>
        </label>
        <Button
          theme="basic"
          className={s.builderToggle}
          isActive={builderOpen}
          aria-expanded={builderOpen}
          onClick={() => setBuilderOpen((open) => !open)}
        >
          {t('QUEUE.FILTERS.BUILDER')}
        </Button>
      </div>

      {builderOpen && (
        <FilterBuilder
          jobs={queue.jobs}
          onApply={(next) => {
            changeSearch(next);
            update({ search: next });
          }}
        />
      )}

      <details className={s.help}>
        <summary className={s.helpSummary}>{t('QUEUE.FILTERS.SEARCH_HELP')}</summary>
        <ul className={s.helpList}>
          {SEARCH_EXAMPLES.map((example) => (
            <li key={example.code}>
              <button
                type="button"
                className={s.example}
                onClick={() => {
                  changeSearch(example.code);
                  update({ search: example.code });
                }}
              >
                {example.code}
              </button>
              <span className={s.exampleHelp}>{t(example.help)}</span>
            </li>
          ))}
        </ul>
      </details>

      {result && (
        <p className={s.result} role="status">
          {t('QUEUE.FILTERS.RESULT', { count: result.matched })}
          {result.truncated && (
            <span className={s.truncated}>
              {' · '}
              {t('QUEUE.FILTERS.TRUNCATED', { scanned: result.scanned.toLocaleString() })}
            </span>
          )}
        </p>
      )}
    </div>
  );
};
