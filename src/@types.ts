import { Queue } from 'bull'
import { Queue as QueueMq } from 'bullmq'

export interface BullBoardQueue {
  queue: Queue | QueueMq
}

export interface BullBoardQueues {
  [key: string]: BullBoardQueue
}
