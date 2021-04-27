import React from 'react'
import { NavLink, useRouteMatch } from 'react-router-dom'
import { AppQueue } from '../../../@types/app'
import { STATUS_LIST, STATUSES } from '../constants'
import s from './StatusMenu.module.css'

export const StatusMenu = ({ queue }: { queue: AppQueue }) => {
  const { url } = useRouteMatch()

  return (
    <div className={s.statusMenu}>
      {STATUS_LIST.map((status) => {
        const isLatest = status === STATUSES.latest
        const displayStatus = status.toLocaleUpperCase()
        return (
          <NavLink
            to={`${url}${isLatest ? '' : `?status=${status}`}`}
            activeClassName={s.active}
            isActive={(_path, { search }) => {
              const query = new URLSearchParams(search)
              return (
                query.get('status') === status ||
                (isLatest && query.get('status') === null)
              )
            }}
            key={`${queue.name}-${status}`}
          >
            <span title={displayStatus}>{displayStatus}</span>
            {queue.counts[status] > 0 && (
              <span className={s.badge}>{queue.counts[status]}</span>
            )}
          </NavLink>
        )
      })}
    </div>
  )
}
