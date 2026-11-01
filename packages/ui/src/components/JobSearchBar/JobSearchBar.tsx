import type { AppQueue, JobSearchField, JobSearchMatch } from '@bull-board/api/typings/app';
import cn from 'clsx';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  JOB_SEARCH_FIELDS,
  JOB_SEARCH_MATCHES,
  JOB_SEARCH_SCAN_LIMITS,
  useJobSearch,
} from '../../hooks/useJobSearch';
import { SelectField } from '../Form/SelectField/SelectField';
import { CloseIcon } from '../Icons/Close';
import { SearchIcon } from '../Icons/Search';
import s from './JobSearchBar.module.css';

const SEARCH_DEBOUNCE_MS = 400;

const FIELD_LABELS = {
  all: 'QUEUE.SEARCH.FIELD.ALL',
  id: 'QUEUE.SEARCH.FIELD.ID',
  name: 'QUEUE.SEARCH.FIELD.NAME',
  data: 'QUEUE.SEARCH.FIELD.DATA',
  dataKey: 'QUEUE.SEARCH.FIELD.DATA_KEY',
  dataValue: 'QUEUE.SEARCH.FIELD.DATA_VALUE',
  error: 'QUEUE.SEARCH.FIELD.ERROR',
  returnValue: 'QUEUE.SEARCH.FIELD.RETURN_VALUE',
  opts: 'QUEUE.SEARCH.FIELD.OPTS',
} as const satisfies Record<JobSearchField, string>;

const MATCH_LABELS = {
  contains: 'QUEUE.SEARCH.MATCH.CONTAINS',
  exact: 'QUEUE.SEARCH.MATCH.EXACT',
  glob: 'QUEUE.SEARCH.MATCH.GLOB',
  regex: 'QUEUE.SEARCH.MATCH.REGEX',
} as const satisfies Record<JobSearchMatch, string>;

const PLACEHOLDERS = {
  contains: 'QUEUE.SEARCH.PLACEHOLDER.CONTAINS',
  exact: 'QUEUE.SEARCH.PLACEHOLDER.EXACT',
  glob: 'QUEUE.SEARCH.PLACEHOLDER.GLOB',
  regex: 'QUEUE.SEARCH.PLACEHOLDER.REGEX',
} as const satisfies Record<JobSearchMatch, string>;

export const JobSearchBar = ({ queue }: { queue: AppQueue }) => {
  const { t } = useTranslation();
  const [params, update] = useJobSearch();
  const [draft, setDraft] = useState(params.search);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Follows the URL when it changes underneath (back button, another queue, a shared link).
  useEffect(() => setDraft(params.search), [params.search, queue.name]);
  useEffect(() => () => clearTimeout(debounceRef.current ?? undefined), []);

  const commit = (value: string) => {
    clearTimeout(debounceRef.current ?? undefined);
    if (value !== params.search) {
      update({ search: value });
    }
  };

  const onDraftChange = (value: string) => {
    setDraft(value);
    clearTimeout(debounceRef.current ?? undefined);
    debounceRef.current = setTimeout(() => commit(value), SEARCH_DEBOUNCE_MS);
  };

  const isFiltering = !!params.search.trim();
  const result = queue.search;

  return (
    <div className={s.bar}>
      <div className={s.controls}>
        <div className={s.inputWrapper}>
          <SearchIcon />
          <input
            className={s.input}
            type="search"
            id="search-jobs"
            spellCheck={false}
            autoComplete="off"
            aria-label={t('QUEUE.SEARCH.LABEL')}
            placeholder={t(PLACEHOLDERS[params.match])}
            value={draft}
            onChange={({ currentTarget }) => onDraftChange(currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                commit(draft);
              } else if (event.key === 'Escape') {
                setDraft('');
                commit('');
              }
            }}
          />
          {draft && (
            <button
              type="button"
              className={s.clear}
              aria-label={t('QUEUE.SEARCH.CLEAR')}
              onClick={() => {
                setDraft('');
                commit('');
              }}
            >
              <CloseIcon />
            </button>
          )}
        </div>

        <SelectField
          id="search-jobs-field"
          className={s.select}
          aria-label={t('QUEUE.SEARCH.SEARCH_IN')}
          value={params.searchIn}
          onChange={(value) => update({ searchIn: value as JobSearchField })}
          options={JOB_SEARCH_FIELDS.map((field) => ({
            value: field,
            text: t(FIELD_LABELS[field]),
          }))}
        />

        <SelectField
          id="search-jobs-match"
          className={s.select}
          aria-label={t('QUEUE.SEARCH.MATCH_MODE')}
          value={params.match}
          onChange={(value) => update({ match: value as JobSearchMatch })}
          options={JOB_SEARCH_MATCHES.map((match) => ({
            value: match,
            text: t(MATCH_LABELS[match]),
          }))}
        />

        <button
          type="button"
          className={cn(s.toggle, { [s.toggleActive]: params.caseSensitive })}
          aria-pressed={params.caseSensitive}
          title={t('QUEUE.SEARCH.CASE_SENSITIVE')}
          aria-label={t('QUEUE.SEARCH.CASE_SENSITIVE')}
          onClick={() => update({ caseSensitive: !params.caseSensitive })}
        >
          Aa
        </button>

        <SelectField
          id="search-jobs-scan-limit"
          className={s.select}
          aria-label={t('QUEUE.SEARCH.SCAN_LIMIT')}
          value={`${params.scanLimit}`}
          onChange={(value) => update({ scanLimit: Number(value) })}
          options={JOB_SEARCH_SCAN_LIMITS.map((limit) => ({
            value: `${limit}`,
            text: t('QUEUE.SEARCH.SCAN_LIMIT_OPTION', { count: limit }),
          }))}
        />
      </div>

      {isFiltering && result && (
        <p className={s.summary} role="status">
          {t('QUEUE.SEARCH.RESULT', { count: result.matched, scanned: result.scanned })}
          {result.truncated && (
            <span className={s.truncated}>
              {' · '}
              {t('QUEUE.SEARCH.TRUNCATED', { limit: result.scanLimit })}
            </span>
          )}
        </p>
      )}
    </div>
  );
};
