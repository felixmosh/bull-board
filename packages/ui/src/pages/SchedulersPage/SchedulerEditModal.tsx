import type { AppJobScheduler, JobSchedulerRepeatOptions } from '@bull-board/api/typings/app';
import { FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/Button/Button';
import { InputField } from '../../components/Form/InputField/InputField';
import { SelectField } from '../../components/Form/SelectField/SelectField';
import { Modal } from '../../components/Modal/Modal';
import s from './SchedulersPage.module.css';

type ScheduleKind = 'pattern' | 'every';

export interface SchedulerEditModalProps {
  open: boolean;
  scheduler: AppJobScheduler;
  onClose(): void;
  /** Resolves to whether the schedule was accepted. */
  onSubmit(repeat: JobSchedulerRepeatOptions): Promise<boolean>;
}

const toDateTimeLocal = (ts?: number): string => {
  if (!ts) {
    return '';
  }
  const date = new Date(ts - new Date(ts).getTimezoneOffset() * 60 * 1000);
  return date.toISOString().slice(0, 16);
};

export const SchedulerEditModal = ({
  open,
  scheduler,
  onClose,
  onSubmit,
}: SchedulerEditModalProps) => {
  const { t } = useTranslation();
  const [kind, setKind] = useState<ScheduleKind>(scheduler.every ? 'every' : 'pattern');
  const [pattern, setPattern] = useState(scheduler.pattern ?? '');
  const [every, setEvery] = useState(scheduler.every ? String(scheduler.every) : '');
  const [tz, setTz] = useState(scheduler.tz ?? '');
  const [limit, setLimit] = useState(scheduler.limit ? String(scheduler.limit) : '');
  const [endDate, setEndDate] = useState(toDateTimeLocal(scheduler.endDate));
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (evt: FormEvent) => {
    evt.preventDefault();

    const repeat: JobSchedulerRepeatOptions = {
      ...(kind === 'pattern' ? { pattern: pattern.trim() } : { every: Number(every) }),
      ...(kind === 'pattern' && tz.trim() ? { tz: tz.trim() } : {}),
      ...(limit ? { limit: Number(limit) } : {}),
      ...(endDate ? { endDate: new Date(endDate).getTime() } : {}),
    };

    setSubmitting(true);
    try {
      // A schedule the server refuses leaves the form open on what was typed, so it can be fixed
      // rather than retyped.
      if (await onSubmit(repeat)) {
        onClose();
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      width="small"
      open={open}
      onClose={onClose}
      title={t('SCHEDULERS.EDIT.TITLE', { id: scheduler.id })}
      actionButton={
        <Button type="submit" theme="primary" form="scheduler-form" disabled={submitting}>
          {t('SCHEDULERS.EDIT.SAVE')}
        </Button>
      }
    >
      <form id="scheduler-form" onSubmit={handleSubmit}>
        <p className={s.modalHint}>{t('SCHEDULERS.EDIT.DESCRIPTION')}</p>
        <SelectField
          label={t('SCHEDULERS.EDIT.KIND')}
          id="scheduler-kind"
          value={kind}
          onChange={(e) => setKind((e.target as HTMLSelectElement).value as ScheduleKind)}
          options={[
            { value: 'pattern', text: t('SCHEDULERS.EDIT.KIND_PATTERN') },
            { value: 'every', text: t('SCHEDULERS.EDIT.KIND_EVERY') },
          ]}
        />
        {kind === 'pattern' ? (
          <>
            <InputField
              label={t('SCHEDULERS.EDIT.PATTERN')}
              id="scheduler-pattern"
              name="pattern"
              value={pattern}
              placeholder="0 3 * * *"
              onChange={(e) => setPattern((e.target as HTMLInputElement).value)}
            />
            <InputField
              label={t('SCHEDULERS.EDIT.TZ')}
              id="scheduler-tz"
              name="tz"
              value={tz}
              placeholder="Europe/Warsaw"
              onChange={(e) => setTz((e.target as HTMLInputElement).value)}
            />
          </>
        ) : (
          <InputField
            label={t('SCHEDULERS.EDIT.EVERY')}
            id="scheduler-every"
            name="every"
            type="number"
            min={1}
            value={every}
            onChange={(e) => setEvery((e.target as HTMLInputElement).value)}
          />
        )}
        <InputField
          label={t('SCHEDULERS.EDIT.LIMIT')}
          id="scheduler-limit"
          name="limit"
          type="number"
          min={1}
          value={limit}
          onChange={(e) => setLimit((e.target as HTMLInputElement).value)}
        />
        <InputField
          label={t('SCHEDULERS.EDIT.END_DATE')}
          id="scheduler-end-date"
          name="endDate"
          type="datetime-local"
          value={endDate}
          onChange={(e) => setEndDate((e.target as HTMLInputElement).value)}
        />
      </form>
    </Modal>
  );
};
