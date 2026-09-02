import styles from './FlowGraph.module.css';

const stateClass: Record<string, string> = {
  completed: styles.stateCompleted,
  failed: styles.stateFailed,
  delayed: styles.stateDelayed,
  active: styles.stateActive,
  waiting: styles.stateWaiting,
  'waiting-children': styles.stateWaitingChildren,
  paused: styles.statePaused,
  prioritized: styles.statePrioritized,
};

export function stateClassName(state: string): string {
  return stateClass[state] || styles.stateDefault;
}
