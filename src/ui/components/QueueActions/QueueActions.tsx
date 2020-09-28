import React from 'react'
import { AppQueue } from '../../../@types/app'
import { Store } from '../../hooks/useStore'
import { Status } from '../constants'
import { RetryIcon } from '../Icons/Retry'
import { TrashIcon } from '../Icons/Trash'
import { Button } from '../JobCard/Button/Button'
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
  <Button onClick={onClick} className={s.button}>
    <TrashIcon />
    Clean all
  </Button>
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
            <Button onClick={actions.retryAll(queue.name)} className={s.button}>
              <RetryIcon />
              Retry all
            </Button>
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
