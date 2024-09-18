import { AppJob } from '@bull-board/api/dist/typings/app';
import React, { FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useActiveQueue } from '../../hooks/useActiveQueue';
import { useJob } from '../../hooks/useJob';
import { useQueues } from '../../hooks/useQueues';
import { Button } from '../Button/Button';
import { JsonField } from '../Form/JsonField/JsonField';
import { Modal } from '../Modal/Modal';

export interface UpdateJobModalProps {
  open: boolean;

  job: AppJob;

  onClose(): void;
}

export const UpdateJobDataModal = ({ open, onClose, job }: UpdateJobModalProps) => {
  const { queues } = useQueues();
  const { actions: jobActions } = useJob();
  const activeQueue = useActiveQueue();
  const { t } = useTranslation();

  if (!queues || !activeQueue) {
    return null;
  }

  const updateJobData = async (evt: FormEvent) => {
    evt.preventDefault();
    const form = evt.target as HTMLFormElement;
    const formData = Object.fromEntries(
      Array.from(form.elements)
        .filter((input: any) => input.name)
        .map((input: any) => [input.name, input.value])
    );

    try {
      formData.jobData = JSON.parse(formData.jobData);

      await jobActions.updateJobData(activeQueue.name, job, formData)();
      onClose();
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <Modal
      width="small"
      open={open}
      onClose={onClose}
      title={t('UPDATE_JOB_DATA.TITLE')}
      actionButton={
        <Button type="submit" theme="primary" form="edit-job-data-form">
          {t('UPDATE_JOB_DATA.UPDATE')}
        </Button>
      }
    >
      <form id="edit-job-data-form" onSubmit={updateJobData}>
        <JsonField
          label={t('UPDATE_JOB_DATA.JOB_DATA')}
          value={job?.data || {}}
          id="job-data"
          name="jobData"
        />
      </form>
    </Modal>
  );
};
