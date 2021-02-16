import React from 'react'
import s from './Menu.module.css'
import { NavLink } from 'react-router-dom'

export const Menu = ({ queues }: { queues: string[] | undefined }) => (
  <aside className={s.aside}>
    <div>QUEUES</div>
    <nav>
      {!!queues && (
        <ul className={s.menu}>
          {queues.map((queueName) => (
            <li key={queueName}>
              <NavLink
                to={`/queue/${queueName}`}
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
