import React from 'react';
import { RepeatableJob } from '@bull-board/api/typings/app'; // Assuming this type exists
import { Card } from '../Card/Card';
import s from './JobSchedulerCard.module.css';
import cronstrue from 'cronstrue';
import cronParser from 'cron-parser';
import { TrashIcon } from '../Icons/Trash';
import { UpdateIcon } from '../Icons/UpdateIcon';
import { Tooltip } from '../Tooltip/Tooltip';
import { Button } from '../Button/Button';
import { useTranslation } from 'react-i18next';

interface JobSchedulerCardProps {
  jobScheduler: RepeatableJob;
  readOnlyMode: boolean;
  actions: {
    updateJobScheduler: () => void;
    removeJobScheduler: () => void;
  };
}

export const JobSchedulerCard = ({
  jobScheduler,
  readOnlyMode,
  actions,
}: JobSchedulerCardProps) => {
  const calculateRemainingRuns = () => {
    if (!jobScheduler.endDate) return null;

    const endDate = new Date(jobScheduler.endDate);
    const now = new Date();
    if (endDate <= now) return 0;

    let intervalMs = 0;

    if (jobScheduler.pattern) {
      try {
        const interval = cronParser.parseExpression(jobScheduler.pattern, { currentDate: now });
        const nextDate = interval.next().toDate();
        intervalMs = nextDate.getTime() - now.getTime();
      } catch (err) {
        console.error('Invalid cron pattern:', err);
        return null;
      }
    } else if (jobScheduler.every) {
      intervalMs = parseInt(jobScheduler.every, 10);
    }

    if (intervalMs > 0) {
      const remainingTime = endDate.getTime() - now.getTime();
      return Math.floor(remainingTime / intervalMs);
    }

    return null;
  };

  const { t } = useTranslation();
  const remainingRuns = calculateRemainingRuns();
  const cronExpression = jobScheduler.pattern ? cronstrue.toString(jobScheduler.pattern) : null;

  interface ButtonType {
    titleKey: string;
    Icon: React.ElementType;
    actionKey: 'updateJobScheduler' | 'removeJobScheduler';
  }

  const buttons: ButtonType[] = [
    { titleKey: 'UPDATE_DATA', Icon: UpdateIcon, actionKey: 'updateJobScheduler' },
    { titleKey: 'CLEAN', Icon: TrashIcon, actionKey: 'removeJobScheduler' },
  ];

  return (
    <Card className={s.card}>
      {jobScheduler.key && <div className={s.header}>{jobScheduler.key}</div>}

      <div className={s.details}>
        <div className={s.contentWrapper}>
          <div className={s.title}>
            <h5>{jobScheduler.name}</h5>
            {!readOnlyMode && (
              <ul className={s.jobActions}>
                {buttons.map((type) => (
                  <li key={type.titleKey}>
                    <Tooltip title={t(`JOB.ACTIONS.${type.titleKey}`)}>
                      <Button onClick={actions[type.actionKey]} className={s.button}>
                        <type.Icon />
                      </Button>
                    </Tooltip>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className={s.content}>
            {jobScheduler.pattern ? (
              <p>
                Cron Expression: {jobScheduler.pattern} ({cronExpression})
              </p>
            ) : (
              <p>Run Every: {jobScheduler.every}ms</p>
            )}
            {jobScheduler.next && <p>Next Run: {new Date(jobScheduler.next).toLocaleString()}</p>}
            {jobScheduler.endDate && (
              <div>
                <p>
                  End Date:
                  {new Date(jobScheduler.endDate).toLocaleString()}
                </p>
                <p>Remaining Runs: {remainingRuns !== null ? remainingRuns : 'N/A'}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
};
