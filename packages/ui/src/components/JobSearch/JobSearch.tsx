import cn from 'clsx';
import { FormEvent, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useHistory } from 'react-router-dom';
import { useSelectedStatuses } from '../../hooks/useSelectedStatuses';
import { JobSearchParams, links } from '../../utils/links';
import { SelectField } from '../Form/SelectField/SelectField';
import { CloseIcon } from '../Icons/Close';
import { SearchIcon } from '../Icons/Search';
import s from './JobSearch.module.css';

interface JobSearchProps {
  queueName: string;
  fields: string[];
  active: JobSearchParams | null;
}

function isTypingTarget(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
  );
}

export const JobSearch = ({ queueName, fields, active }: JobSearchProps) => {
  const { t } = useTranslation();
  const history = useHistory();
  const selectedStatuses = useSelectedStatuses();
  const inputRef = useRef<HTMLInputElement>(null);
  const [field, setField] = useState(active?.field ?? fields[0] ?? '');
  const [value, setValue] = useState(active?.value ?? '');
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    setField(active?.field ?? fields[0] ?? '');
    setValue(active?.value ?? '');
  }, [active?.field, active?.value, fields[0]]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === '/' && !event.metaKey && !event.ctrlKey && !isTypingTarget(event.target)) {
        event.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  if (fields.length === 0) {
    return null;
  }

  const go = (search: JobSearchParams | null) =>
    history.push(links.queuePage(queueName, selectedStatuses, search));

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = value.trim();
    go(trimmed ? { field, value: trimmed } : null);
  };

  const clear = () => {
    setValue('');
    if (active) {
      go(null);
    }
    inputRef.current?.focus();
  };

  return (
    <form
      role="search"
      className={cn(s.control, { [s.active]: !!active })}
      onSubmit={submit}
      aria-label={t('QUEUE.SEARCH.LABEL')}
    >
      {fields.length > 1 ? (
        <SelectField
          className={s.fieldSelect}
          aria-label={t('QUEUE.SEARCH.FIELD')}
          options={fields.map((name) => ({ text: name, value: name }))}
          value={field}
          onChange={(next) => {
            setField(next);
            inputRef.current?.focus();
          }}
        />
      ) : (
        <span className={s.fieldLabel} title={t('QUEUE.SEARCH.FIELD')}>
          {field}
        </span>
      )}
      <label className={s.inputWrapper}>
        <SearchIcon />
        <input
          ref={inputRef}
          className={s.input}
          type="search"
          enterKeyHint="search"
          value={value}
          placeholder={t('QUEUE.SEARCH.PLACEHOLDER', { field })}
          aria-label={t('QUEUE.SEARCH.VALUE', { field })}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onChange={({ currentTarget }) => setValue(currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape' && (value || active)) {
              event.preventDefault();
              clear();
            }
          }}
        />
      </label>
      {value || active ? (
        <button
          type="button"
          className={s.clear}
          onClick={clear}
          aria-label={t('QUEUE.SEARCH.CLEAR')}
          title={t('QUEUE.SEARCH.CLEAR')}
        >
          <CloseIcon />
        </button>
      ) : (
        !focused && (
          <kbd className={s.shortcut} aria-hidden="true">
            /
          </kbd>
        )
      )}
    </form>
  );
};
