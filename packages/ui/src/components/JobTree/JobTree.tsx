import React from 'react';
import { JobTreeNode } from '@bull-board/api/typings/app';
import s from './JobTree.module.css';
import { Link } from 'react-router-dom';

export function JobTree({ jobTree }: { jobTree: JobTreeNode[] }) {
  return (
    <ul className={s.node}>
      {jobTree.map((job) => (
        <li key={job.id}>
          <div className={s.nodeHeader}>
            <div className={s.nodeSubHeader}>
              <Link to={`/queue/${job.queueName}/${job.id}`} className={s.nodeName}>
                {job.name}
              </Link>
              <span className={s.nodeStatus}>{job.status.toUpperCase()}</span>
            </div>
            <Link to={`/queue/${job.queueName}`} className={s.nodeQueue}>
              {job.queueName}
            </Link>
          </div>
          {job.jobTree && job.jobTree.length > 0 && <JobTree jobTree={job.jobTree} />}
        </li>
      ))}
    </ul>
  );
}
