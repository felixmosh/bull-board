import cn from 'classnames'
import React from 'react'
import { AppQueue } from '../../../@types/app'
import { Store } from '../../hooks/useStore'
import { STATUS_LIST } from '../constants'
import s from './StatusMenu.module.css'

export const StatusMenu = ({
  queue,
  selectedStatus,
  onChange,
}: {
  queue: AppQueue
  selectedStatus: Store['selectedStatuses']
  onChange: (status: Store['selectedStatuses']) => void
}) => (
  <div className={s.statusMenu}>
    {STATUS_LIST.map(status => {
      const isActive = selectedStatus[queue.name] === status
      return (
        <button
          type="button"
          key={`${queue.name}-${status}`}
          onClick={() => onChange({ [queue.name]: status })}
          className={cn({ [s.active]: isActive })}
        >
          {status}
          {queue.counts[status] > 0 && (
            <span className={s.badge}>{queue.counts[status]}</span>
          )}
        </button>
      )
    })}
  </div>
)
