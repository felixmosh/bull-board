import type { AppJob } from '@bull-board/api/typings/app';
import { FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../Button/Button';
import { InputField } from '../Form/InputField/InputField';
import { Modal } from '../Modal/Modal';

const PRIORITY_LIMIT = 2 ** 21 - 1;

function toLocalInputValue(ms: number): string {
  const local = new Date(ms - new Date(ms).getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

export interface EditJobModalProps {
  open: boolean;
  job: AppJob;
  field: 'delay' | 'priority';
  onClose(): void;
  onSubmit(value: number): Promise<void>;
}

export const EditJobModal = ({ open, job, field, onClose, onSubmit }: EditJobModalProps) => {
  const { t } = useTranslation();
  const runsAt = job.timestamp + (job.delay || 0);

  const [value, setValue] = useState(() =>
    field === 'delay' ? toLocalInputValue(runsAt) : String(job.priority ?? 0)
  );

  const handleSubmit = async (evt: FormEvent) => {
    evt.preventDefault();

    if (field === 'delay') {
      const runAt = new Date(value).getTime();
      if (Number.isNaN(runAt)) return;
      await onSubmit(runAt);
    } else {
      const priority = parseInt(value, 10);
      if (!Number.isInteger(priority) || priority < 0 || priority > PRIORITY_LIMIT) return;
      await onSubmit(priority);
    }

    onClose();
  };

  return (
    <Modal
      width="small"
      open={open}
      onClose={onClose}
      title={t(field === 'delay' ? 'JOB.EDIT.DELAY_TITLE' : 'JOB.EDIT.PRIORITY_TITLE')}
      actionButton={
        <Button type="submit" theme="primary" form="edit-job-form">
          {t('JOB.EDIT.SAVE')}
        </Button>
      }
    >
      <form id="edit-job-form" onSubmit={handleSubmit}>
        <p>{t(field === 'delay' ? 'JOB.EDIT.DELAY_HINT' : 'JOB.EDIT.PRIORITY_HINT')}</p>
        {field === 'delay' ? (
          <InputField
            label={t('JOB.EDIT.RUN_AT')}
            id="edit-job-run-at"
            name="runAt"
            type="datetime-local"
            autoFocus
            value={value}
            onChange={(e) => setValue((e.target as HTMLInputElement).value)}
          />
        ) : (
          <InputField
            label={t('JOB.EDIT.PRIORITY')}
            id="edit-job-priority"
            name="priority"
            type="number"
            min={0}
            max={PRIORITY_LIMIT}
            autoFocus
            value={value}
            onChange={(e) => setValue((e.target as HTMLInputElement).value)}
          />
        )}
      </form>
    </Modal>
  );
};
