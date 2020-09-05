import { useParams } from 'react-router'
import React from 'react'
import { AppQueue } from '../../../@types/app'
import { Store } from '../../hooks/useStore'
import { Card } from '../Card/Card'
import { StatusMenu } from '../StatusMenu/StatusMenu'

export const QueuePage = ({
  selectedStatus,
  actions,
  queue,
}: {
  queue: AppQueue | undefined
  actions: Store['actions']
  selectedStatus: Store['selectedStatuses']
}) => {
  const { name } = useParams()

  if (!queue) {
    return <div>Queue Not found</div>
  }

  return (
    <section>
      <StatusMenu
        queue={queue}
        selectedStatus={selectedStatus}
        onChange={actions.setSelectedStatuses}
      />
      <Card />
      <h1>{name}</h1>
      {JSON.stringify(selectedStatus)}
      {queue?.counts.active}
    </section>
  )
}
