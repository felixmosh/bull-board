import type { FlowNode } from '@bull-board/api/typings/app';
import { Handle, Position } from '@xyflow/react';
import cn from 'clsx';
import { ChevronDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Tooltip } from '../Tooltip/Tooltip';
import type { FlowJobNodeData } from './flowLayout';
import { stateClassName } from './flowStates';
import styles from './FlowGraph.module.css';

const NO_PROGRESS_STATES = new Set(['waiting', 'waiting-children', 'delayed', 'unknown']);

function reportedProgress(node: FlowNode): number | null {
  if (NO_PROGRESS_STATES.has(node.state)) {
    return null;
  }

  const { progress } = node;

  if (typeof progress === 'number' && Number.isFinite(progress)) {
    return progress > 0 ? progress : null;
  }

  if (typeof progress === 'object' && progress !== null && 'progress' in progress) {
    const value = (progress as Record<string, unknown>).progress;
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value > 0 ? value : null;
    }
  }

  return null;
}

export function shortJobId(id: string): string {
  return id.length > 8 ? `…${id.slice(-8)}` : id;
}

export const FlowJobNode = ({
  data,
}: {
  data: FlowJobNodeData & {
    isExpanding: boolean;
    isExpanded: boolean;
    onExpand: (node: FlowNode) => void;
  };
}) => {
  const { t } = useTranslation();
  const { node, isSelected, parentQueueName, isExpanding, isExpanded, onExpand } = data;
  const progress = reportedProgress(node);
  const deps = node.dependencies;
  const reasons = Object.values(node.ignoredChildFailureReasons || {});
  const showQueue = node.queueName !== parentQueueName;
  const missing = deps
    ? deps.processed + deps.unprocessed + deps.ignored + deps.failed - node.children.length
    : 0;

  return (
    <div className={cn(styles.node, stateClassName(node.state), isSelected && styles.selected)}>
      <Handle type="target" position={Position.Left} className={styles.handle} />
      <span className={styles.rail} />

      <div className={styles.nodeHeader}>
        <h4 className={styles.jobName} title={node.name ?? undefined}>
          {node.name ?? node.id}
        </h4>
        <span className={styles.jobId} title={String(node.id)}>
          {shortJobId(String(node.id))}
        </span>
      </div>

      <div className={styles.nodeMeta}>
        <span className={styles.stateBadge}>{node.state}</span>
        {showQueue && (
          <span className={styles.queueLabel} title={node.queueName}>
            {node.queueName}
          </span>
        )}
      </div>

      <div className={styles.nodeFooter}>
        {!!deps && (
          <span className={styles.dependencies}>
            {deps.processed > 0 && <span>{t('JOB.FLOW.PROCESSED', { n: deps.processed })}</span>}
            {deps.unprocessed > 0 && (
              <span>{t('JOB.FLOW.UNPROCESSED', { n: deps.unprocessed })}</span>
            )}
            {deps.failed > 0 && (
              <span className={styles.depFailed}>{t('JOB.FLOW.FAILED', { n: deps.failed })}</span>
            )}
            {deps.ignored > 0 && (
              <Tooltip title={reasons.join('\n')} className={styles.depIgnoredTrigger}>
                <span className={styles.depIgnored}>
                  {t('JOB.FLOW.IGNORED', { n: deps.ignored })}
                </span>
              </Tooltip>
            )}
          </span>
        )}
        {progress !== null && (
          <span className={styles.progressText}>{t('JOB.FLOW.PROGRESS', { n: progress })}</span>
        )}
      </div>

      {node.truncated && !isExpanded && (
        <button
          type="button"
          className={cn(styles.expandButton, 'nodrag', 'nopan')}
          disabled={isExpanding}
          onClick={() => onExpand(node)}
        >
          <ChevronDown size={13} />
          {isExpanding
            ? t('JOB.FLOW.EXPANDING')
            : t('JOB.FLOW.EXPAND', { n: missing > 0 ? missing : 0 })}
        </button>
      )}

      {node.truncated && isExpanded && !isExpanding && (
        <span className={styles.expandCapped}>
          {t('JOB.FLOW.CAPPED', {
            shown: node.children.length,
            total: node.children.length + (missing > 0 ? missing : 0),
          })}
        </span>
      )}

      {progress !== null && (
        <span className={styles.progressBar}>
          <span
            className={styles.progressFill}
            style={{ transform: `scaleX(${progress / 100})` }}
          />
        </span>
      )}

      <Handle type="source" position={Position.Right} className={styles.handle} />
    </div>
  );
};
