import React from 'react'
import { Status } from '../../constants'
import { PromoteIcon } from '../../Icons/Promote'
import { RetryIcon } from '../../Icons/Retry'
import { TrashIcon } from '../../Icons/Trash'
import { Tooltip } from '../../Tooltip/Tooltip'
import s from './JobActions.module.css'

interface JobActionsProps {
  status: Status
  actions: {
    promoteJob: () => Promise<void>
    retryJob: () => Promise<void>
    cleanJob: () => Promise<void>
  }
}
export const JobActions = ({ actions }: JobActionsProps) => (
  <ul className={s.jobActions}>
    <li>
      <Tooltip title="Promote">
        <button type="button" onClick={actions.promoteJob}>
          <PromoteIcon />
        </button>
      </Tooltip>
    </li>
    <li>
      <Tooltip title="Clean">
        <button type="button" onClick={actions.cleanJob}>
          <TrashIcon />
        </button>
      </Tooltip>
    </li>
    <li>
      <Tooltip title="Retry">
        <button type="button" onClick={actions.retryJob}>
          <RetryIcon />
        </button>
      </Tooltip>
    </li>
  </ul>
)
