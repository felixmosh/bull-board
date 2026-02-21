'use client';

import type { FlowNode, Status } from '@bull-board/api/typings/app';
import React from 'react';
import { useJobFlow } from '../../hooks/useJobFlow';
import { useActiveJobId } from '../../hooks/useActiveJobId';
import styles from './JobFlow.module.css';
import { Card } from '../Card/Card';
import jobCardStyles from '../JobCard/JobCard.module.css';
import { useSelectedStatuses } from '../../hooks/useSelectedStatuses';
import { Link } from 'react-router-dom';
import { links } from '../../utils/links';
import cn from 'clsx';

const getStateColorClass = (state: string): string => {
  const colorMap: Record<string, string> = {
    completed: styles.stateCompleted,
    failed: styles.stateFailed,
    delayed: styles.stateDelayed,
    active: styles.stateActive,
    waiting: styles.stateWaiting,
    'waiting-children': styles.stateWaitingChildren,
    paused: styles.statePaused,
    prioritized: styles.statePrioritized,
    unknown: styles.stateDefault,
  };
  return colorMap[state] || styles.stateDefault;
};

function getNumericProgress(progress: FlowNode['progress']): number | null {
  if (typeof progress === 'number' && Number.isFinite(progress)) return progress;
  if (typeof progress === 'object' && progress !== null && 'progress' in progress) {
    const val = (progress as Record<string, unknown>).progress;
    if (typeof val === 'number' && Number.isFinite(val)) return val;
  }
  return null;
}

const ProgressBar: React.FC<{ progress: number }> = ({ progress }) => (
  <div className={styles.progressBar}>
    <div className={styles.progressFill} style={{ width: `${progress}%` }} />
  </div>
);

const JobNodeComponent: React.FC<{
  node: FlowNode;
  jobId: string | undefined;
  queueName: string;
  selectedStatuses: Record<string, Status>;
}> = ({ node, jobId, queueName, selectedStatuses }) => {
  const isHighlighted = node.id === jobId;
  const progress = getNumericProgress(node.progress);
  return (
    <li className={styles.nodeWrapper}>
      <div
        className={cn(
          styles.nodeCard,
          getStateColorClass(node.state),
          isHighlighted && styles.highlighted
        )}
      >
        <div className={styles.nodeInfo}>
          <div className={styles.nodeHeader}>
            <div className={styles.nodeName}>
              <Link to={links.jobPage(queueName, String(node.id), selectedStatuses)}>
                <h4 className={styles.jobName}>{node.name ?? node.id}</h4>
              </Link>
              <span className={styles.jobId}>({String(node.id).slice(0, 8)}...)</span>
            </div>
            <span className={styles.stateBadge}>{node.state}</span>
          </div>
          <div className={styles.nodeFooter}>
            <span className={styles.queueLabel}>{node.queueName}</span>
            {progress !== null && (
              <div className={styles.progressGroup}>
                <ProgressBar progress={progress} />
                <span className={styles.progressText}>{progress}%</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {!!node.children && node.children.length > 0 && (
        <ul className={styles.childrenWrapper}>
          {node.children.map((child) => (
            <JobNodeComponent
              key={child.id}
              node={child}
              jobId={jobId}
              queueName={child.queueName}
              selectedStatuses={selectedStatuses}
            />
          ))}
        </ul>
      )}
    </li>
  );
};

export const JobFlow = () => {
  const { flow, loading, error } = useJobFlow();
  const jobId = useActiveJobId();
  const selectedStatuses = useSelectedStatuses();

  if (loading) {
    return (
      <div className={styles.loadingContainer}>
        <div className={styles.loadingContent}>
          <div className={styles.spinner} />
          <p className={styles.loadingText}>Loading flow tree...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.errorContainer}>
        <h3 className={styles.errorTitle}>Error loading flow tree</h3>
        <p className={styles.errorMessage}>{error}</p>
      </div>
    );
  }

  if (!flow || !flow.isFlowNode || !flow.flowRoot) {
    return null;
  }

  return (
    <Card className={cn(jobCardStyles.card, styles.jobFlowCard)}>
      <div className={jobCardStyles.header}>
        <div className={jobCardStyles.titleWithLink}>
          <h4>Job Flow</h4>
        </div>
      </div>
      <div className={styles.content}>
        <div className={styles.treeContainer}>
          <ul className={styles.treeRoot}>
            <JobNodeComponent
              node={flow.flowRoot}
              jobId={jobId}
              queueName={flow.flowRoot.queueName}
              selectedStatuses={selectedStatuses}
            />
          </ul>
        </div>
      </div>
    </Card>
  );
};
