import React from 'react'
import { NavLink } from 'react-router-dom'
import { Store } from '../../hooks/useStore'
import { STATUS_LIST } from '../constants'
import s from './Menu.module.css'

export const Menu = ({
  queues,
  selectedStatuses,
}: {
  queues: string[] | undefined
  selectedStatuses: Store['selectedStatuses']
}) => (
  <aside className={s.aside}>
    <div>QUEUES</div>
    <nav>
      {!!queues && (
        <ul className={s.menu}>
          {queues.map((queueName) => (
            <li key={queueName}>
              <NavLink
                to={`/queue/${encodeURIComponent(queueName)}${
                  !selectedStatuses[queueName] ||
                  selectedStatuses[queueName] === STATUS_LIST[0]
                    ? ''
                    : `?status=${selectedStatuses[queueName]}`
                }`}
                activeClassName={s.active}
                title={queueName}
              >
                {queueName}
              </NavLink>
            </li>
          ))}
        </ul>
      )}
    </nav>
    <div className={s.appVersion}>{process.env.APP_VERSION}</div>
  </aside>
)
