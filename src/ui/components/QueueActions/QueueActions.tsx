import React from 'react'
import { AppQueue } from '../../../@types/app'
import { Store } from '../../hooks/useStore'
import { Status } from '../constants'
import { RetryIcon } from '../Icons/Retry'
import { TrashIcon } from '../Icons/Trash'
import s from './QueueActions.module.css'

interface QueueActionProps {
  queue: AppQueue
  actions: Store['actions']
  status: Status
}

const ACTIONABLE_STATUSES = ['failed', 'delayed', 'completed']

const isStatusActionable = (status: Status): boolean =>
  ACTIONABLE_STATUSES.includes(status)

const CleanAllButton = ({ onClick }: any) => (
  <button onClick={onClick} type="button">
    <TrashIcon />
    Clean all
  </button>
)

export const QueueActions = ({ status, actions, queue }: QueueActionProps) => {
  if (!isStatusActionable(status)) {
    return null
  }

  return (
    <ul className={s.queueActions}>
      {status === 'failed' && (
        <>
          <li>
            <button onClick={actions.retryAll(queue.name)}>
              <RetryIcon />
              Retry all
            </button>
          </li>
          <li>
            <CleanAllButton onClick={actions.cleanAllFailed(queue.name)} />
          </li>
        </>
      )}
      {status === 'delayed' && (
        <li>
          <CleanAllButton onClick={actions.cleanAllDelayed(queue.name)} />
        </li>
      )}
      {status === 'completed' && (
        <li>
          <CleanAllButton onClick={actions.cleanAllCompleted(queue.name)} />
        </li>
      )}
    </ul>
  )
}
