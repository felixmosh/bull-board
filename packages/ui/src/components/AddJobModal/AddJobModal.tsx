import { AppQueue } from '@bull-board/api/dist/typings/app';
import * as Dialog from '@radix-ui/react-dialog';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { QueueActions } from '../../../typings/app';
import { Button } from '../Button/Button';
import { InputField } from '../Form/InputField/InputField';
import { JsonField } from '../Form/JsonField/JsonField';
import { Modal } from '../Modal/Modal';

export interface AddJobModalProps {
  open: boolean;

  onClose(): void;

  actions: QueueActions;
  queue: AppQueue;
}

export const AddJobModal = ({ open, onClose, actions, queue }: AddJobModalProps) => {
  const [jobName, setJobName] = useState('');
  const [jobData, setJobData] = useState<any>({});
  const [jobDelay, setJobDelay] = useState('');
  const [jobAttempts, setJobAttempts] = useState('');
  const { t } = useTranslation();

  const addJob = () => {
    actions.addJob(queue.name, jobName || '__default__', jobData, {
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
        min={0}
        onChange={(event) => setJobDelay(event.target.value)}
      />
      <InputField
        label={t('ADD_JOB.JOB_ATTEMPTS')}
        id="job-attempts"
        type="number"
        value={jobAttempts}
        min={1}
        onChange={(event) => setJobAttempts(event.target.value)}
      />
    </Modal>
  );
};
