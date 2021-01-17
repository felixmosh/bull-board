import React from 'react'
import { Store } from '../../hooks/useStore'
// import { STATUSES } from '../constants'
import { MenuActions } from './MenuActions/MenuActions'
import { NavLink } from 'react-router-dom'
import s from './Menu.module.css'

interface Queues {
  name: string
  isPaused: boolean
}

export const Menu = ({
  queues,
  actions,
}: {
  queues: Queues[] | undefined
  actions: Store['actions']
}) => {
  return (
    <aside className={s.aside}>
      <div>QUEUES</div>
      <nav>
        {!!queues && (
          <ul className={s.menu}>
            {queues.map((queue) => (
              <li key={queue.name}>
                <NavLink to={`/queue/${queue.name}`} activeClassName={s.active}>
                  <MenuActions queue={queue} actions={actions} />
                  &nbsp;
                  {queue.name}
                </NavLink>
              </li>
            ))}
          </ul>
        )}
      </nav>
      <div className={s.appVersion}>{process.env.APP_VERSION}</div>
    </aside>
  )
}
