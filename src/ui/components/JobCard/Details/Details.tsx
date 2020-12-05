import React from 'react'
import { AppJob } from '../../../../@types/app'
import { useDetailsTabs } from '../../../hooks/useDetailsTabs'
import { Status } from '../../constants'
import { Button } from '../Button/Button'
import s from './Details.module.css'

interface DetailsProps {
  job: AppJob
  status: Status
}

export const Details = ({ status, job }: DetailsProps) => {
  const { tabs, getTabContent } = useDetailsTabs(status)

  if (tabs.length === 0) {
    return null
  }

  return (
    <div className={s.details}>
      <ul className={s.tabActions}>
        {tabs.map((tab) => (
          <li key={tab.title}>
            <Button onClick={tab.selectTab} isActive={tab.isActive}>
              {tab.title}
            </Button>
          </li>
        ))}
      </ul>
      <div className={s.tabContent}>
        <div>{getTabContent(job)}</div>
      </div>
    </div>
  )
}
