import React from 'react'
import s from './Menu.module.css'
import { NavLink } from 'react-router-dom'
import { AppQueue } from '../../../@types/app'

export const Menu = ({ queues }: { queues: Array<AppQueue> | undefined }) => (
  <aside className={s.aside}>
    <div>QUEUES</div>
    <nav>
      {!!queues && (
        <ul className={s.menu}>
          {queues.map(({ name, counts }) => (
            <li key={name}>
              <NavLink to={`/queue/${name}`} activeClassName={s.active}>
                <div className={s.name}>{name}</div>
                <div className={s.stat}>
                  <div className={s.statItem}>
                    <span className={s.statIcon}>⚪</span>
                    {counts.waiting}
                  </div>
                  <div className={s.statItem}>
                    <span className={s.statIcon}>🔵</span>
                    {counts.active}
                  </div>
                  <div className={s.statItem}>
                    <span className={s.statIcon}>🔴</span>
                    {counts.failed}
                  </div>
                  <div className={s.statItem}>
                    <span className={s.statIcon}>🟠</span>
                    {counts.delayed}
                  </div>
                  <div className={s.statItem}>
                    <span className={s.statIcon}>🟡</span>
                    {counts.paused}
                  </div>
                  <div className={s.statItem}>
                    <span className={s.statIcon}>🟢</span>
                    {counts.completed}
                  </div>
                </div>
              </NavLink>
            </li>
          ))}
        </ul>
      )}
    </nav>
    <div className={s.appVersion}>{process.env.APP_VERSION}</div>
  </aside>
)
