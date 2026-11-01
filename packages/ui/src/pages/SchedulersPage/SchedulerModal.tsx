import type {
  AppJobScheduler,
  AppQueue,
  JobSchedulerRepeatOptions,
} from '@bull-board/api/typings/app';
import { FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/Button/Button';
import { InputField } from '../../components/Form/InputField/InputField';
import { JsonField } from '../../components/Form/JsonField/JsonField';
import { SelectField } from '../../components/Form/SelectField/SelectField';
import { Modal } from '../../components/Modal/Modal';
import s from './SchedulersPage.module.css';

type ScheduleKind = 'pattern' | 'every';

export interface SchedulerModalProps {
  open: boolean;
  scheduler?: AppJobScheduler;
  queues: AppQueue[];
  initialQueueName?: string;
  onClose(): void;
  onSubmit(
    repeat: JobSchedulerRepeatOptions,
    job: { queueName: string; id: string; name: string; data: unknown }
  ): Promise<boolean>;
}

const toDateTimeLocal = (ts?: number): string => {
  if (!ts) {
    return '';
  }
  const date = new Date(ts - new Date(ts).getTimezoneOffset() * 60 * 1000);
  return date.toISOString().slice(0, 16);
};

export const SchedulerModal = ({
  open,
  scheduler,
  queues,
  initialQueueName,
  onClose,
  onSubmit,
}: SchedulerModalProps) => {
  const { t } = useTranslation();
  const [queueName, setQueueName] = useState(
    scheduler?.queueName ?? initialQueueName ?? queues[0]?.name ?? ''
  );
  const [id, setId] = useState(scheduler?.id ?? '');
  const [name, setName] = useState(scheduler?.name ?? '');
  const [kind, setKind] = useState<ScheduleKind>(scheduler?.every ? 'every' : 'pattern');
  const [pattern, setPattern] = useState(scheduler?.pattern ?? '');
  const [every, setEvery] = useState(scheduler?.every ? String(scheduler.every) : '');
  const [tz, setTz] = useState(scheduler?.tz ?? '');
  const [limit, setLimit] = useState(scheduler?.limit ? String(scheduler.limit) : '');
  const [endDate, setEndDate] = useState(toDateTimeLocal(scheduler?.endDate));
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (evt: FormEvent) => {
    evt.preventDefault();
    const form = evt.target as HTMLFormElement;
    const jobData = scheduler
      ? undefined
      : (form.elements.namedItem('jobData') as HTMLInputElement).value;
    if (!scheduler && !jobData) {
      return;
    }
    const data = scheduler ? scheduler.template?.data : JSON.parse(jobData!);

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
      if (await onSubmit(repeat, { queueName, id, name: name.trim() || '__default__', data })) {
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
      title={scheduler ? t('SCHEDULERS.EDIT.TITLE', { id: scheduler.id }) : t('SCHEDULERS.CREATE')}
      actionButton={
        <Button type="submit" theme="primary" form="scheduler-form" disabled={submitting}>
          {t(scheduler ? 'SCHEDULERS.EDIT.SAVE' : 'SCHEDULERS.CREATE')}
        </Button>
      }
    >
      <form id="scheduler-form" onSubmit={handleSubmit}>
        {scheduler ? (
          <>
            <p className={s.modalHint}>{t('SCHEDULERS.EDIT.DESCRIPTION')}</p>
            <p className={s.modalHint}>{t('SCHEDULERS.EDIT.OVERWRITE_NOTE')}</p>
          </>
        ) : (
          <>
            <SelectField
              label={t('SCHEDULERS.QUEUE_NAME')}
              id="scheduler-queue"
              value={queueName}
              onChange={setQueueName}
              options={queues.map((queue) => ({
                value: queue.name,
                text: queue.displayName || queue.name,
              }))}
            />
            <InputField
              label={t('SCHEDULERS.ID')}
              id="scheduler-id"
              value={id}
              required
              onChange={(e) => setId(e.target.value)}
            />
            <InputField
              label={t('SCHEDULERS.JOB_NAME')}
              id="scheduler-job-name"
              value={name}
              placeholder="__default__"
              onChange={(e) => setName(e.target.value)}
            />
            <JsonField label={t('SCHEDULERS.JOB_DATA')} id="scheduler-job-data" name="jobData" />
          </>
        )}
        <SelectField
          label={t('SCHEDULERS.EDIT.KIND')}
          id="scheduler-kind"
          name="kind"
          value={kind}
          onChange={(value) => setKind(value as ScheduleKind)}
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
