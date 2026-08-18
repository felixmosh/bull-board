import { Tabs } from '@base-ui/react/tabs';
import type { AppJob, Status } from '@bull-board/api/typings/app';
import { useTranslation } from 'react-i18next';
import { TabsType, useDetailsTabs } from '../../../hooks/useDetailsTabs';
import { dynamicTranslationKey } from '../../../utils/dynamicTranslationKey';
import { Button } from '../../Button/Button';
import { DetailsContent } from './DetailsContent/DetailsContent';
import s from './Details.module.css';

interface DetailsProps {
  job: AppJob;
  status: Status;
  actions: { getJobLogs: () => Promise<string[]> };
  withTimeline?: boolean;
}

export const Details = ({ status, job, actions, withTimeline = false }: DetailsProps) => {
  const { tabs, selectedTab, selectTab } = useDetailsTabs({ currentStatus: status, withTimeline });
  const { t } = useTranslation();

  if (tabs.length === 0) {
    return null;
  }

  return (
    <Tabs.Root
      className={s.details}
      value={selectedTab}
      onValueChange={(value) => selectTab(value as TabsType)}
    >
      <Tabs.List className={s.tabActions}>
        {tabs.map((tab) => (
          <Tabs.Tab key={tab} value={tab} render={<Button isActive={tab === selectedTab} />}>
            {t(dynamicTranslationKey(`JOB.TABS.${tab.toUpperCase()}`))}
          </Tabs.Tab>
        ))}
      </Tabs.List>
      {tabs.map((tab) => (
        <Tabs.Panel key={tab} value={tab} className={s.tabContent}>
          <DetailsContent selectedTab={tab} job={job} actions={actions} status={status} />
        </Tabs.Panel>
      ))}
    </Tabs.Root>
  );
};
