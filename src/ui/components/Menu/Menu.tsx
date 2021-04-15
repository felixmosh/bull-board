import React from 'react'
import s from './Menu.module.css'
import { AppQueue } from '../../../@types/app'
import { NavLink } from 'react-router-dom'

export const Menu = ({ queues }: { queues: AppQueue[] | undefined }) => (
  <aside className={s.aside}>
    <div>QUEUES</div>
    <nav>
      {!!queues && (
        <ul className={s.menu}>
          {queues.map((queue, i) => (
            <li key={i}>
              <NavLink
                to={`/queue/${queue.name}`}
                activeClassName={s.active}
                title={queue.name}
              >
                <div>{queue.name}</div>
                <div className={s.jobCounts}>
                  {!!queue.counts.active && (
                    <span className={s.jobCountActive} title="Active Jobs">
                      {queue.counts.active}
                    </span>
                  )}
                  {!!queue.counts.waiting && (
                    <span className={s.jobCountWaiting} title="Waiting Jobs">
                      {queue.counts.waiting}
                    </span>
                  )}
                  {!!queue.counts.completed && (
                    <span
                      className={s.jobCountCompleted}
                      title="Completed Jobs"
                    >
                      {queue.counts.completed}
                    </span>
                  )}
                  {!!queue.counts.failed && (
                    <span className={s.jobCountFailed} title="Failed Jobs">
                      {queue.counts.failed}
                    </span>
                  )}
                  {!!queue.counts.delayed && (
                    <span className={s.jobCountDelayed} title="Delayed Jobs">
                      {queue.counts.delayed}
                    </span>
                  )}
                  {!!queue.counts.paused && (
                    <span className={s.jobCountPaused} title="Paused Jobs">
                      {queue.counts.paused}
                    </span>
                  )}
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
