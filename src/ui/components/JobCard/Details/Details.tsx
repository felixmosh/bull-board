import { AppJob } from '../../../../@types/app'
import { Button } from '../Button/Button'
import React from 'react'
import { Status } from '../../constants'
import s from './Details.module.css'
import { useDetailsTabs } from '../../../hooks/useDetailsTabs'

interface DetailsProps {
  job: AppJob
  status: Status
  queueName: string
}

export const Details = ({ status, job, queueName }: DetailsProps) => {
  const { tabs, getTabContent } = useDetailsTabs(status, queueName)

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
