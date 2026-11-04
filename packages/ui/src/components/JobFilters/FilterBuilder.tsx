import type { AppJob } from '@bull-board/api/typings/app';
import { useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLastCompletedJob } from '../../hooks/useLastCompletedJob';
import {
  BUILDER_OPERATORS,
  BuilderCondition,
  BuilderJoin,
  BuilderOperator,
  buildSearch,
  conditionFromSample,
  operatorTakesList,
  operatorTakesValue,
  SampleField,
  sampleFields,
  suggestFields,
} from '../../utils/searchBuilder';
import { Button } from '../Button/Button';
import { SelectField } from '../Form/SelectField/SelectField';
import { AddIcon } from '../Icons/Add';
import { CloseIcon } from '../Icons/Close';
import s from './FilterBuilder.module.css';

const emptyCondition = (): BuilderCondition => ({ field: '', operator: '=', value: '' });

/** Operators named in words; the rest show their SQL symbol as is. */
const OPERATOR_LABELS = {
  CONTAINS: 'QUEUE.FILTERS.BUILDER_OP_CONTAINS',
  'IS NULL': 'QUEUE.FILTERS.BUILDER_OP_IS_NULL',
  'IS NOT NULL': 'QUEUE.FILTERS.BUILDER_OP_IS_NOT_NULL',
} as const;

const isBlank = ({ field, value }: BuilderCondition) => !field.trim() && !value.trim();

const MAX_PREVIEW = 40;
const SAMPLE_FILTER_FROM = 12;

function previewValue(value: unknown): string {
  const text = typeof value === 'string' ? JSON.stringify(value) : String(value);
  return text.length > MAX_PREVIEW ? `${text.slice(0, MAX_PREVIEW - 1)}…` : text;
}

const hasLabel = (operator: BuilderOperator): operator is keyof typeof OPERATOR_LABELS =>
  operator in OPERATOR_LABELS;

interface FilterBuilderProps {
  queueName: string;
  jobs: AppJob[];
  onApply: (search: string) => void;
}

/**
 * Rows of field / operator / value that write the search text, so a filter can be put together
 * without knowing the syntax. The fields of the queue's last completed job are offered as ready
 * made conditions, and the field input also suggests the paths of the jobs on screen.
 */
export const FilterBuilder = ({ queueName, jobs, onApply }: FilterBuilderProps) => {
  const { t } = useTranslation();
  const listId = useId();
  const [conditions, setConditions] = useState<BuilderCondition[]>([emptyCondition()]);
  const [join, setJoin] = useState<BuilderJoin>('AND');

  const [sampleFilter, setSampleFilter] = useState('');
  const lastCompleted = useLastCompletedJob(queueName, true);
  const samples = useMemo(
    () => (lastCompleted.job ? sampleFields(lastCompleted.job) : []),
    [lastCompleted.job]
  );
  const visibleSamples = useMemo(() => {
    const needle = sampleFilter.trim().toLowerCase();
    return needle
      ? samples.filter(
          (sample) =>
            sample.path.toLowerCase().includes(needle) ||
            String(sample.value).toLowerCase().includes(needle)
        )
      : samples;
  }, [samples, sampleFilter]);

  const fields = useMemo(
    () => [...new Set([...samples.map((sample) => sample.path), ...suggestFields(jobs)])],
    [samples, jobs]
  );
  const search = buildSearch(conditions, join);

  const change = (index: number, patch: Partial<BuilderCondition>) =>
    setConditions((current) =>
      current.map((condition, i) => (i === index ? { ...condition, ...patch } : condition))
    );
  // A picked field fills the row still left blank, or adds a new one.
  const addSample = (sample: SampleField) =>
    setConditions((current) => {
      const condition = conditionFromSample(sample);
      const last = current[current.length - 1];
      return last && isBlank(last) ? [...current.slice(0, -1), condition] : [...current, condition];
    });
  const remove = (index: number) =>
    setConditions((current) =>
      current.length > 1 ? current.filter((_, i) => i !== index) : [emptyCondition()]
    );

  const operatorOptions = BUILDER_OPERATORS.map((operator) => ({
    value: operator,
    text: hasLabel(operator) ? t(OPERATOR_LABELS[operator]) : operator,
  }));

  return (
    <div className={s.builder}>
      <div className={s.joinRow}>
        <span className={s.label} id={`${listId}-join`}>
          {t('QUEUE.FILTERS.BUILDER_MATCH')}
        </span>
        <SelectField
          className={s.joinSelect}
          aria-labelledby={`${listId}-join`}
          value={join}
          onChange={(value) => setJoin(value as BuilderJoin)}
          options={[
            { value: 'AND', text: t('QUEUE.FILTERS.BUILDER_MATCH_ALL') },
            { value: 'OR', text: t('QUEUE.FILTERS.BUILDER_MATCH_ANY') },
          ]}
        />
      </div>

      <section className={s.sample} aria-labelledby={`${listId}-sample`}>
        <div className={s.sampleHeader}>
          <span className={s.label} id={`${listId}-sample`}>
            {t('QUEUE.FILTERS.BUILDER_SAMPLE_TITLE')}
          </span>
          {lastCompleted.job && (
            <span className={s.sampleMeta}>
              #{lastCompleted.job.id}
              {' · '}
              {new Date(
                lastCompleted.job.finishedOn ?? lastCompleted.job.timestamp
              ).toLocaleString()}
            </span>
          )}
          <button
            type="button"
            className={s.refresh}
            disabled={lastCompleted.refreshing}
            onClick={() => lastCompleted.refetch()}
          >
            {t('QUEUE.FILTERS.BUILDER_SAMPLE_REFRESH')}
          </button>
        </div>

        {lastCompleted.loading ? (
          <p className={s.sampleNote}>{t('QUEUE.FILTERS.BUILDER_SAMPLE_LOADING')}</p>
        ) : !lastCompleted.job ? (
          <p className={s.sampleNote}>{t('QUEUE.FILTERS.BUILDER_SAMPLE_EMPTY')}</p>
        ) : (
          <>
            <p className={s.sampleNote}>{t('QUEUE.FILTERS.BUILDER_SAMPLE_HELP')}</p>
            {samples.length >= SAMPLE_FILTER_FROM && (
              <input
                type="search"
                className={`${s.input} ${s.sampleFilter}`}
                value={sampleFilter}
                placeholder={t('QUEUE.FILTERS.BUILDER_SAMPLE_FILTER')}
                aria-label={t('QUEUE.FILTERS.BUILDER_SAMPLE_FILTER')}
                onChange={({ currentTarget }) => setSampleFilter(currentTarget.value)}
              />
            )}
            <ul className={s.chips}>
              {visibleSamples.map((sample) => (
                <li key={sample.path}>
                  <button
                    type="button"
                    className={s.chip}
                    title={`${sample.path} = ${String(sample.value)}`}
                    onClick={() => addSample(sample)}
                  >
                    <span className={s.chipPath}>{sample.path}</span>
                    <span className={s.chipValue}>{previewValue(sample.value)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <datalist id={listId}>
        {fields.map((field) => (
          <option key={field} value={field} />
        ))}
      </datalist>

      <ul className={s.conditions}>
        {conditions.map((condition, index) => (
          <li key={index} className={s.condition}>
            <input
              type="text"
              className={`${s.input} ${s.fieldInput}`}
              list={listId}
              value={condition.field}
              placeholder={t('QUEUE.FILTERS.BUILDER_FIELD')}
              aria-label={t('QUEUE.FILTERS.BUILDER_FIELD')}
              autoComplete="off"
              spellCheck={false}
              onChange={({ currentTarget }) => change(index, { field: currentTarget.value })}
            />
            <SelectField
              className={s.operatorSelect}
              aria-label={t('QUEUE.FILTERS.BUILDER_OPERATOR')}
              value={condition.operator}
              onChange={(operator) => change(index, { operator: operator as BuilderOperator })}
              options={operatorOptions}
            />
            {operatorTakesValue(condition.operator) ? (
              <input
                type="text"
                className={`${s.input} ${s.valueInput}`}
                value={condition.value}
                placeholder={
                  operatorTakesList(condition.operator)
                    ? t('QUEUE.FILTERS.BUILDER_VALUE_LIST')
                    : t('QUEUE.FILTERS.BUILDER_VALUE')
                }
                aria-label={t('QUEUE.FILTERS.BUILDER_VALUE')}
                autoComplete="off"
                spellCheck={false}
                onChange={({ currentTarget }) => change(index, { value: currentTarget.value })}
                onKeyDown={(event) => event.key === 'Enter' && search && onApply(search)}
              />
            ) : (
              <span className={s.valueInput} />
            )}
            <button
              type="button"
              className={s.remove}
              aria-label={t('QUEUE.FILTERS.BUILDER_REMOVE')}
              title={t('QUEUE.FILTERS.BUILDER_REMOVE')}
              onClick={() => remove(index)}
            >
              <CloseIcon />
            </button>
          </li>
        ))}
      </ul>

      <div className={s.footer}>
        <Button
          theme="basic"
          compact
          className={s.add}
          onClick={() => setConditions((current) => [...current, emptyCondition()])}
        >
          <AddIcon />
          {t('QUEUE.FILTERS.BUILDER_ADD')}
        </Button>
        <code className={s.preview} title={search}>
          {search || t('QUEUE.FILTERS.BUILDER_EMPTY')}
        </code>
        <Button theme="primary" compact disabled={!search} onClick={() => onApply(search)}>
          {t('QUEUE.FILTERS.BUILDER_APPLY')}
        </Button>
      </div>
    </div>
  );
};
