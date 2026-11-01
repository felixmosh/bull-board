import { Menu } from '@base-ui/react/menu';
import type { AppQueue, JobSearchField, JobSearchMatch } from '@bull-board/api/typings/app';
import cn from 'clsx';
import { ReactNode, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  JOB_SEARCH_DEFAULTS,
  JOB_SEARCH_FIELDS,
  JOB_SEARCH_MATCHES,
  JOB_SEARCH_SCAN_LIMITS,
  useJobSearch,
} from '../../hooks/useJobSearch';
import { Button } from '../Button/Button';
import { DropdownContent } from '../DropdownContent/DropdownContent';
import { CheckIcon } from '../Icons/Check';
import { ChevronRightIcon } from '../Icons/ChevronRight';
import { CloseIcon } from '../Icons/Close';
import { FilterIcon } from '../Icons/Filter';
import { SearchIcon } from '../Icons/Search';
import { Tooltip } from '../Tooltip/Tooltip';
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

/** One option of the filter menu, opened as a submenu that shows its current value. */
const OptionSubmenu = <T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; text: string }[];
  onChange: (value: T) => void;
}) => (
  <Menu.SubmenuRoot>
    <Menu.SubmenuTrigger className={s.item}>
      {/* Empty, so these rows line up with the checkbox row below. */}
      <span className={s.indicator} aria-hidden />
      <span>{label}</span>
      <span className={s.current}>{options.find((option) => option.value === value)?.text}</span>
      <ChevronRightIcon className={s.chevron} />
    </Menu.SubmenuTrigger>
    <Menu.Portal>
      <Menu.Positioner alignOffset={-4} sideOffset={4} style={{ zIndex: 100 }}>
        <DropdownContent className={s.menu}>
          <Menu.RadioGroup value={value} onValueChange={(next) => onChange(next as T)}>
            {options.map((option) => (
              <Menu.RadioItem key={option.value} value={option.value} className={s.item}>
                <Menu.RadioItemIndicator className={s.indicator} keepMounted>
                  <CheckIcon />
                </Menu.RadioItemIndicator>
                {option.text}
              </Menu.RadioItem>
            ))}
          </Menu.RadioGroup>
        </DropdownContent>
      </Menu.Positioner>
    </Menu.Portal>
  </Menu.SubmenuRoot>
);

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

  const hasCustomOptions =
    params.searchIn !== JOB_SEARCH_DEFAULTS.searchIn ||
    params.match !== JOB_SEARCH_DEFAULTS.match ||
    params.caseSensitive !== JOB_SEARCH_DEFAULTS.caseSensitive ||
    params.scanLimit !== JOB_SEARCH_DEFAULTS.scanLimit;

  const result = params.search.trim() ? queue.search : undefined;
  let summary: ReactNode = null;
  if (result) {
    const text = t('QUEUE.SEARCH.RESULT', { count: result.matched, scanned: result.scanned });
    summary = result.truncated ? (
      <Tooltip title={t('QUEUE.SEARCH.TRUNCATED', { limit: result.scanLimit })}>
        <span className={cn(s.summary, s.truncated)} role="status">
          {text}
        </span>
      </Tooltip>
    ) : (
      <span className={s.summary} role="status">
        {text}
      </span>
    );
  }

  return (
    <div className={s.bar}>
      {summary}

      <div className={s.searchWrapper}>
        <SearchIcon />
        <input
          className={s.search}
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

      <Menu.Root>
        <Menu.Trigger
          render={
            <Button
              className={s.trigger}
              isActive={hasCustomOptions}
              aria-label={t('QUEUE.SEARCH.OPTIONS')}
              title={t('QUEUE.SEARCH.OPTIONS')}
            >
              <FilterIcon />
            </Button>
          }
        />
        <Menu.Portal>
          <Menu.Positioner align="end" sideOffset={4} style={{ zIndex: 100 }}>
            <DropdownContent className={s.menu}>
              <OptionSubmenu
                label={t('QUEUE.SEARCH.SEARCH_IN')}
                value={params.searchIn}
                onChange={(searchIn) => update({ searchIn })}
                options={JOB_SEARCH_FIELDS.map((field) => ({
                  value: field,
                  text: t(FIELD_LABELS[field]),
                }))}
              />
              <OptionSubmenu
                label={t('QUEUE.SEARCH.MATCH_MODE')}
                value={params.match}
                onChange={(match) => update({ match })}
                options={JOB_SEARCH_MATCHES.map((match) => ({
                  value: match,
                  text: t(MATCH_LABELS[match]),
                }))}
              />
              <OptionSubmenu
                label={t('QUEUE.SEARCH.SCAN_LIMIT')}
                value={`${params.scanLimit}`}
                onChange={(limit) => update({ scanLimit: Number(limit) })}
                options={JOB_SEARCH_SCAN_LIMITS.map((limit) => ({
                  value: `${limit}`,
                  text: t('QUEUE.SEARCH.SCAN_LIMIT_OPTION', { limit: limit.toLocaleString() }),
                }))}
              />
              <Menu.Separator className={s.separator} />
              <Menu.CheckboxItem
                className={s.item}
                checked={params.caseSensitive}
                onCheckedChange={(caseSensitive) => update({ caseSensitive })}
              >
                <Menu.CheckboxItemIndicator className={s.indicator} keepMounted>
                  <CheckIcon />
                </Menu.CheckboxItemIndicator>
                {t('QUEUE.SEARCH.CASE_SENSITIVE')}
              </Menu.CheckboxItem>
            </DropdownContent>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>
    </div>
  );
};
