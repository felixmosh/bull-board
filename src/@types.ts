import { Queue } from 'bull'
import { Queue as QueueMq } from 'bullmq'

export interface BullBoardQueue {
  queue: Queue | QueueMq
  version: number | string
}

export interface BullBoardQueues {
  [key: string]: BullBoardQueue
}
