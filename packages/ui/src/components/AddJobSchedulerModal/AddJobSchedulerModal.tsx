import React, { FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '../Modal/Modal';
import { Button } from '../Button/Button';
import { InputField } from '../Form/InputField/InputField';
import { JsonField } from '../Form/JsonField/JsonField';
import { useQueues } from '../../hooks/useQueues';
import { SelectField } from '../Form/SelectField/SelectField';
import s from './AddJobSchedulerModal.module.css';

export interface AddJobSchedulerModalProps {
  open: boolean;
  onClose(): void;
}

export const AddJobSchedulerModal = ({ open, onClose }: AddJobSchedulerModalProps) => {
  const { t } = useTranslation();
  const [jobSchedulerName, setJobSchedulerName] = useState('');
  const [jobName, setJobName] = useState('');
  const { queues, actions } = useQueues();
  const [selectedQueue, setSelectedQueue] = useState('');

  // Job Schedulers are currently only supported for BullMQ queues
  const jobSchedulerSupportedQueues = queues?.filter((queue) => queue.type === 'bullmq') || [];

  const addJobScheduler = async (evt: FormEvent) => {
    evt.preventDefault();
    const form = evt.target as HTMLFormElement;
    const formData = Object.fromEntries(
      Array.from(form.elements)
        .filter((input: any) => input.name)
        .map((input: any) => [input.name, input.value])
    );

    formData.repeatOptions = JSON.parse(formData.repeatOptions);
    formData.jobData = JSON.parse(formData.jobData);
    formData.jobOptions = JSON.parse(formData.jobOptions);

    await actions.addJobScheduler(
      formData.queueName,
      formData.jobSchedulerName,
      formData.repeatOptions,
      { name: formData.jobName, data: formData.jobData, opts: formData.jobOptions }
    )();
    onClose();
  };

  return (
    <Modal
      width="wide"
      open={open}
      onClose={onClose}
      title={t('ADD_JOB_SCHEDULER.TITLE')}
      actionButton={
        <Button type="submit" theme="primary" form="add-job-scheduler-form">
          {t('ADD_JOB_SCHEDULER.ADD')}
        </Button>
      }
    >
      <form id="add-job-scheduler-form" onSubmit={addJobScheduler} className={s.formGrid}>
        <div className={s.formColumn}>
          <SelectField
            label={t('ADD_JOB_SCHEDULER.QUEUE_NAME')}
            id="queue-name"
            options={jobSchedulerSupportedQueues.map((queue) => ({
              text: queue.name,
              value: queue.name,
            }))}
            name="queueName"
            value={selectedQueue}
            onChange={(event) => setSelectedQueue(event.target.value)}
          />
          <InputField
            label={t('ADD_JOB_SCHEDULER.JOB_SCHEDULER_NAME')}
            id="job-scheduler-name"
            name="jobSchedulerName"
            value={jobSchedulerName}
            onChange={(e) => setJobSchedulerName(e.target.value)}
          />
          <InputField
            label={t('ADD_JOB_SCHEDULER.JOB_NAME')}
            id="job-name"
            name="jobName"
            value={jobName}
            onChange={(e) => setJobName(e.target.value)}
          />
          <JsonField
            label={t('ADD_JOB_SCHEDULER.REPEAT_OPTIONS')}
            id="repeat-options"
            name="repeatOptions"
          />
        </div>
        <div className={s.formColumn}>
          <JsonField label={t('ADD_JOB_SCHEDULER.JOB_DATA')} id="job-data" name="jobData" />
          <JsonField
            label={t('ADD_JOB_SCHEDULER.JOB_OPTIONS')}
            id="job-options"
            name="jobOptions"
          />
        </div>
      </form>
    </Modal>
  );
};
