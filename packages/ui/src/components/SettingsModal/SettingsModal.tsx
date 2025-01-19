import React from 'react';
import { useTranslation } from 'react-i18next';
import { languages } from '../../constants/languages';
import { useSettingsStore } from '../../hooks/useSettings';
import { useUIConfig } from '../../hooks/useUIConfig';
import { InputField } from '../Form/InputField/InputField';
import { SelectField } from '../Form/SelectField/SelectField';
import { SwitchField } from '../Form/SwitchField/SwitchField';
import { Modal } from '../Modal/Modal';
import { availableJobTabs } from '../../hooks/useDetailsTabs';

export interface SettingsModalProps {
  open: boolean;

  onClose(): void;
}

const pollingIntervals = [-1, 3, 5, 10, 20, 60, 60 * 5, 60 * 15];
const maxJobsPerPage = 300;

export const SettingsModal = ({ open, onClose }: SettingsModalProps) => {
  const {
    language,
    pollingInterval,
    jobsPerPage,
    confirmQueueActions,
    confirmJobActions,
    collapseJob,
    collapseJobData,
    collapseJobOptions,
    collapseJobError,
    defaultJobTab,
    darkMode,
    setSettings,
  } = useSettingsStore((state) => state);
  const { pollingInterval: uiConfigPollingInterval } = useUIConfig();
  const { t, i18n } = useTranslation();

  return (
    <Modal width="small" open={open} onClose={onClose} title={t('SETTINGS.TITLE')}>
      <SelectField
        label={t('SETTINGS.LANGUAGE')}
        id="language"
        options={languages.map((lng) => ({ text: lng, value: lng }))}
        value={language}
        onChange={(event) => {
          i18n.changeLanguage(event.target.value);
          setSettings({ language: event.target.value });
        }}
      />
      {uiConfigPollingInterval?.showSetting !== false && (
        <SelectField
          label={t('SETTINGS.POLLING_INTERVAL')}
          id="polling-interval"
          options={pollingIntervals.map((interval) => ({
            text:
              interval < 0
                ? t('SETTINGS.POLLING_OPTIONS.OFF')
                : Math.floor(interval / 60) === 0
                ? t('SETTINGS.POLLING_OPTIONS.SECS', { count: interval })
                : t('SETTINGS.POLLING_OPTIONS.MINS', { count: interval / 60 }),
            value: `${interval}`,
          }))}
          value={`${pollingInterval}`}
          onChange={(event) => setSettings({ pollingInterval: +event.target.value })}
        />
      )}
      <SelectField
        label={t('SETTINGS.DEFAULT_JOB_TAB')}
        id="default-job-tab"
        options={['default'].concat(availableJobTabs).map((tab) => ({
          text: t(`JOB.TABS.${tab.toUpperCase()}`),
          value: tab,
        }))}
        value={defaultJobTab}
        onChange={(event) => setSettings({ defaultJobTab: event.target.value })}
      />
      <InputField
        label={t('SETTINGS.JOBS_PER_PAGE')}
        id="jobs-per-page"
        value={jobsPerPage}
        type="number"
        min="1"
        max={maxJobsPerPage}
        maxLength={3}
        onChange={(event) => {
          const jobsPerPage = +event.target.value;
          setSettings({ jobsPerPage: Math.min(jobsPerPage, maxJobsPerPage) });
        }}
      />
      <SwitchField
        label={t('SETTINGS.CONFIRM_QUEUE_ACTIONS')}
        id="confirm-queue-actions"
        checked={confirmQueueActions}
        onCheckedChange={(checked) => setSettings({ confirmQueueActions: checked })}
      />
      <SwitchField
        label={t('SETTINGS.CONFIRM_JOB_ACTIONS')}
        id="confirm-job-actions"
        checked={confirmJobActions}
        onCheckedChange={(checked) => setSettings({ confirmJobActions: checked })}
      />
      <SwitchField
        label={t('SETTINGS.COLLAPSE_JOB')}
        id="collapse-job"
        checked={collapseJob}
        onCheckedChange={(checked) => setSettings({ collapseJob: checked })}
      />
      <SwitchField
        label={t('SETTINGS.COLLAPSE_JOB_DATA')}
        id="collapse-job-data"
        checked={collapseJobData}
        onCheckedChange={(checked) => setSettings({ collapseJobData: checked })}
      />
      <SwitchField
        label={t('SETTINGS.COLLAPSE_JOB_OPTIONS')}
        id="collapse-job-options"
        checked={collapseJobOptions}
        onCheckedChange={(checked) => setSettings({ collapseJobOptions: checked })}
      />
      <SwitchField
        label={t('SETTINGS.COLLAPSE_JOB_ERROR')}
        id="collapse-job-error"
        checked={collapseJobError}
        onCheckedChange={(checked) => setSettings({ collapseJobError: checked })}
      />
      <SwitchField
        label={t('SETTINGS.DARK_MODE')}
        id="dark-mode"
        checked={darkMode}
        onCheckedChange={(checked) => setSettings({ darkMode: checked })}
      />
    </Modal>
  );
};
