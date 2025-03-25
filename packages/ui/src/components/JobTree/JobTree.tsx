import React from 'react';
import { Link } from 'react-router-dom';
import { AppJob, JobTreeNode } from '@bull-board/api/typings/app';
import s from './JobTree.module.css';
import { links } from '../../utils/links';

export function JobTree({ jobTree, job }: { job: AppJob; jobTree: JobTreeNode[] }) {
  const queueName = job.parent?.queueKey.split(':')[1];
  return (
    <div className={s.parentNodeContainer}>
      <ul>
        <li className={s.parentNode}>
          <div>
            {job.parent && queueName ? (
              <Link to={links.jobPage(queueName, job.parent.id)} className={s.nodeName}>
                [parent]
              </Link>
            ) : (
              <p className={s.parentJob}>{job.parent ? job.name : `${job.name} (root)`}</p>
            )}
          </div>
        </li>
        {jobTree.length > 0 && (
          <li>
            <JobTreeNodes jobTree={jobTree} />
          </li>
        )}
      </ul>
    </div>
  );
}

export function JobTreeNodes({ jobTree }: { jobTree: JobTreeNode[] }) {
  return (
    <ul className={s.node}>
      {jobTree.map((job) => (
        <li key={job.id}>
          <div style={{ display: 'flex', gap: '4px', alignItems: 'top' }}>
            <span className={s.nodeStatus}>{job.status.toUpperCase()}</span>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <Link to={`/queue/${job.queueName}/${job.id}`} className={s.nodeName}>
                {job.name}
              </Link>
              <Link to={`/queue/${job.queueName}`} className={s.nodeQueue}>
                {job.queueName}
              </Link>
            </div>
          </div>
          {job.jobTree && job.jobTree.length > 0 && <JobTreeNodes jobTree={job.jobTree} />}
        </li>
      ))}
    </ul>
  );
}
