import { useTranslation } from 'react-i18next';
import { useJobSearchInspection, useSearchFields } from '../../hooks/useJobSearch';
import { Card } from '../Card/Card';
import jobCardStyles from '../JobCard/JobCard.module.css';
import styles from './JobSearchIndex.module.css';

interface JobSearchIndexProps {
  queueName: string;
  jobId: string;
}

export const JobSearchIndex = ({ queueName, jobId }: JobSearchIndexProps) => {
  const { t } = useTranslation();
  const { diagnostics } = useSearchFields(queueName, true);
  const { data } = useJobSearchInspection(queueName, jobId, diagnostics.inspect);

  if (!diagnostics.inspect || !data || 'error' in data) {
    return null;
  }

  return (
    <Card className={jobCardStyles.card}>
      <div className={jobCardStyles.header}>
        <div className={jobCardStyles.titleWithLink}>
          <h2 className={jobCardStyles.jobName}>{t('JOB.SEARCH_INDEX.TITLE')}</h2>
        </div>
      </div>
      <table className={styles.table}>
        <thead>
          <tr>
            <th scope="col">{t('JOB.SEARCH_INDEX.FIELD')}</th>
            <th scope="col">{t('JOB.SEARCH_INDEX.VALUES')}</th>
            <th scope="col">{t('JOB.SEARCH_INDEX.STATE')}</th>
          </tr>
        </thead>
        <tbody>
          {data.fields.map(({ field, values, indexed }) => (
            <tr key={field}>
              <th scope="row" className={styles.field}>
                {field}
              </th>
              <td>
                {values.length ? (
                  <div className={styles.values}>
                    {values.map((value) => (
                      <code key={value} className={styles.value}>
                        {value}
                      </code>
                    ))}
                  </div>
                ) : (
                  <span className={styles.empty}>{t('JOB.SEARCH_INDEX.NO_VALUE')}</span>
                )}
              </td>
              <td className={styles.state}>
                <span
                  className={styles.dot}
                  style={{ backgroundColor: `var(--status-${indexed ? 'completed' : 'failed'})` }}
                />
                {t(indexed ? 'JOB.SEARCH_INDEX.INDEXED' : 'JOB.SEARCH_INDEX.NOT_INDEXED')}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
};
