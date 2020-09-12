import { JobOptions, Queue } from 'bull'
import { Job as JobMq, JobsOptions, Queue as QueueMq } from 'bullmq'
import React from 'react'
import { Status } from '../ui/components/constants'

export interface BullBoardQueue {
  queue: Queue | QueueMq
}

export interface BullBoardQueues {
  [key: string]: BullBoardQueue
}

export interface ValidMetrics {
  total_system_memory: string
  redis_version: string
  used_memory: string
  mem_fragmentation_ratio: string
  connected_clients: string
  blocked_clients: string
}

export interface AppJob {
  id: string | number | undefined
  timestamp: number | null
  processedOn: number | null
  finishedOn: number | null
  progress: JobMq['progress']
  attempts: JobMq['attemptsMade']
  failedReason: JobMq['failedReason']
  stacktrace: string[] | null
  opts: JobsOptions | JobOptions
  data: JobMq['data']
  name: JobMq['name']
  delay: number | undefined
}

export interface AppQueue {
  name: string
  counts: Record<Status, number>
  jobs: AppJob[]
}

export type SelectedStatuses = Record<AppQueue['name'], Status>

export interface QueueActions {
  promoteJob: (queueName: string) => (job: AppJob) => () => Promise<void>
  retryJob: (queueName: string) => (job: AppJob) => () => Promise<void>
  cleanJob: (queueName: string) => (job: AppJob) => () => Promise<void>
  retryAll: (queueName: string) => () => Promise<void>
  cleanAllDelayed: (queueName: string) => () => Promise<void>
  cleanAllFailed: (queueName: string) => () => Promise<void>
  cleanAllCompleted: (queueName: string) => () => Promise<void>
  setSelectedStatuses: React.Dispatch<React.SetStateAction<SelectedStatuses>>
}
