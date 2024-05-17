import * as Dialog from '@radix-ui/react-dialog';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueues } from '../../hooks/useQueues';
import { Button } from '../Button/Button';
import { InputField } from '../Form/InputField/InputField';
import { JsonField } from '../Form/JsonField/JsonField';
import { SelectField } from '../Form/SelectField/InputField';
import { Modal } from '../Modal/Modal';

export interface AddJobModalProps {
  open: boolean;

  onClose(): void;
}

export const AddJobModal = ({ open, onClose }: AddJobModalProps) => {
  const { actions, queues } = useQueues();
  const [queueName, setQueueName] = useState('');
  const [jobName, setJobName] = useState('');
  const [jobData, setJobData] = useState<any>({});
  const [jobDelay, setJobDelay] = useState('');
  const [jobAttempts, setJobAttempts] = useState('');
  const { t } = useTranslation();

  useEffect(() => {
    if (queues && queues.length) {
      setQueueName(queues[0].name);
    }
  }, [queues]);

  const addJob = () => {
    actions.addJob(queueName, jobName || '__default__', jobData, {
      delay: jobDelay ? +jobDelay : undefined,
      attempts: jobAttempts ? +jobAttempts : undefined,
    })();
  };

  return (
    <Modal
      width="small"
      open={open}
      onClose={onClose}
      title={t('ADD_JOB.TITLE')}
      actionButton={
        <Dialog.Close asChild>
          <Button theme="primary" onClick={addJob}>
            {t('ADD_JOB.ADD')}
          </Button>
        </Dialog.Close>
      }
    >
      <SelectField
        label={t('ADD_JOB.QUEUE_NAME')}
        id="queue-name"
        options={(queues || []).map((queue) => ({
          text: queue.name,
          value: queue.name,
        }))}
        value={queueName}
        onChange={(event) => setQueueName(event.target.value)}
      />
      <InputField
        label={t('ADD_JOB.JOB_NAME')}
        id="job-name"
        value={jobName}
        placeholder="__default__"
        onChange={(event) => setJobName(event.target.value)}
      />
      <JsonField
        label={t('ADD_JOB.JOB_DATA')}
        id="job-data"
        value={jobData}
        onChange={(v) => setJobData(v)}
      />
      <InputField
        label={t('ADD_JOB.JOB_DELAY')}
        id="job-delay"
        type="number"
        value={jobDelay}
        onChange={(event) => setJobDelay(event.target.value)}
      />
      <InputField
        label={t('ADD_JOB.JOB_ATTEMPTS')}
        id="job-attempts"
        type="number"
        value={jobAttempts}
        onChange={(event) => setJobAttempts(event.target.value)}
      />
    </Modal>
  );
};
