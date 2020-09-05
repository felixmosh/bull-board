import { useParams } from 'react-router'
import React from 'react'

export const QueuePage = () => {
  const { name } = useParams()

  return <div>{name}</div>
}
