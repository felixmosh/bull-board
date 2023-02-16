import React from 'react';
import { useSettingsStore } from '../../hooks/useSettings';
import { InputField } from '../Form/InputField/InputField';
import { SelectField } from '../Form/SelectField/InputField';
import { SwitchField } from '../Form/SwitchField/SwitchField';
import { Modal } from '../Modal/Modal';

export interface SettingsModalProps {
  open: boolean;

  onClose(): void;
}

const pollingIntervals = [-1, 3, 5, 10, 20, 60, 60 * 5, 60 * 15].map((interval) => ({
  text:
    interval < 0
      ? 'Off'
      : Math.floor(interval / 60) === 0
      ? `${interval} seconds`
      : `${interval / 60} minutes`,
  value: `${interval}`,
}));

export const SettingsModal = ({ open, onClose }: SettingsModalProps) => {
  const {
    pollingInterval,
    jobsPerPage,
    confirmQueueActions,
    confirmJobActions,
    collapseJobData,
    collapseJobOptions,
    collapseJobError,
    setSettings,
  } = useSettingsStore((state) => state);

  return (
    <Modal width="small" open={open} onClose={onClose} title="Settings">
      <SelectField
        label="Polling interval"
        id="polling-interval"
        options={pollingIntervals}
        value={`${pollingInterval}`}
        onChange={(event) => setSettings({ pollingInterval: +event.target.value })}
      />
      <InputField
        label="Jobs per page"
        id="jobs-per-page"
        value={jobsPerPage}
        type="number"
        min="1"
        max="50"
        onChange={(event) => setSettings({ jobsPerPage: +event.target.value })}
      />
      <SwitchField
        label="Confirm queue actions"
        id="confirm-queue-actions"
        checked={confirmQueueActions}
        onCheckedChange={(checked) => setSettings({ confirmQueueActions: checked })}
      />
      <SwitchField
        label="Confirm job actions"
        id="confirm-job-actions"
        checked={confirmJobActions}
        onCheckedChange={(checked) => setSettings({ confirmJobActions: checked })}
      />
      <SwitchField
        label="Collapse job data"
        id="collapse-job-data"
        checked={collapseJobData}
        onCheckedChange={(checked) => setSettings({ collapseJobData: checked })}
      />
      <SwitchField
        label="Collapse job options"
        id="collapse-job-options"
        checked={collapseJobOptions}
        onCheckedChange={(checked) => setSettings({ collapseJobOptions: checked })}
      />
      <SwitchField
        label="Collapse job error"
        id="collapse-job-error"
        checked={collapseJobError}
        onCheckedChange={(checked) => setSettings({ collapseJobError: checked })}
      />
    </Modal>
  );
};
