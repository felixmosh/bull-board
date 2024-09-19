import { AppJob, AppQueue } from '@bull-board/api/typings/app';
import React, { FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useActiveQueue } from '../../hooks/useActiveQueue';
import { useQueues } from '../../hooks/useQueues';
import bullJobOptionsSchema from '../../schemas/bull/jobOptions.json';
import bullMQJobOptionsSchema from '../../schemas/bullmq/jobOptions.json';
import { Button } from '../Button/Button';
import { InputField } from '../Form/InputField/InputField';
import { JsonField } from '../Form/JsonField/JsonField';
import { SelectField } from '../Form/SelectField/SelectField';
import { Modal } from '../Modal/Modal';

export interface AddJobModalProps {
  open: boolean;
  job?: AppJob | null;
  onClose(): void;
}

const jobOptionsSchema = {
  bull: bullJobOptionsSchema,
  bullmq: bullMQJobOptionsSchema,
} as const;

export const AddJobModal = ({ open, onClose, job }: AddJobModalProps) => {
  const { queues, actions } = useQueues();
  const activeQueue = useActiveQueue();
  const [selectedQueue, setSelectedQueue] = useState<AppQueue | null>(activeQueue);
  const { t } = useTranslation();

  if (!queues || !activeQueue || !selectedQueue) {
    return null;
  }

  const addJob = async (evt: FormEvent) => {
    evt.preventDefault();
    const form = evt.target as HTMLFormElement;
    const formData = Object.fromEntries(
      Array.from(form.elements)
        .filter((input: any) => input.name)
        .map((input: any) => [input.name, input.value])
    );

    formData.jobData = JSON.parse(formData.jobData);
    formData.jobOptions = JSON.parse(formData.jobOptions);

    await actions.addJob(
      formData.queueName,
      formData.jobName || '__default__',
      formData.jobData,
      formData.jobOptions
    )();
    onClose();
  };

  return (
    <Modal
      width="small"
      open={open}
      onClose={onClose}
      title={t('ADD_JOB.TITLE', { context: job ? 'duplicate' : undefined })}
      actionButton={
        <Button type="submit" theme="primary" form="add-job-form">
          {t(`ADD_JOB.${job ? 'DUPLICATE' : 'ADD'}`)}
        </Button>
      }
    >
      <form id="add-job-form" onSubmit={addJob}>
        <SelectField
          label={t('ADD_JOB.QUEUE_NAME')}
          id="queue-name"
          options={(queues || []).map((queue) => ({
            text: queue.name,
            value: queue.name,
          }))}
          name="queueName"
          value={selectedQueue.name || ''}
          onChange={(event) => setSelectedQueue(queues.find((q) => q.name === event.target.value)!)}
        />
        <InputField
          label={t('ADD_JOB.JOB_NAME')}
          id="job-name"
          name="jobName"
          defaultValue={job?.name}
          placeholder="__default__"
        />
        <JsonField label={t('ADD_JOB.JOB_DATA')} id="job-data" name="jobData" value={job?.data} />
        <JsonField
          label={t('ADD_JOB.JOB_OPTIONS')}
          id="job-options"
          name="jobOptions"
          schema={jobOptionsSchema[selectedQueue.type]}
          value={job?.opts}
        />
      </form>
    </Modal>
  );
};
