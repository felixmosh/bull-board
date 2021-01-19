import React from 'react'
import { AppQueue } from '../../../@types/app'
import { Store } from '../../hooks/useStore'
import { Button } from './Button/Button'
import { PauseIcon } from '../Icons/Pause'
import { ResumeIcon } from '../Icons/Resume'
import s from './QueueStatus.module.css'

interface QueueActionProps {
  queue: AppQueue
  actions: Store['actions']
}

interface ButtonType {
  title: string
  Icon: React.ElementType
  actionKey: 'pause' | 'resume'
}

const buttonTypes: Record<string, ButtonType> = {
  pause: { title: 'Pause', Icon: PauseIcon, actionKey: 'pause' },
  resume: { title: 'Resume', Icon: ResumeIcon, actionKey: 'resume' },
}

//@ts-check
export const QueueStatus = ({ actions, queue }: QueueActionProps) => {
  const button = queue?.isPaused ? buttonTypes.resume : buttonTypes.pause
  return (
    <div className={s.queueStatus}>
      <Button
        onClick={actions[button.actionKey](queue.name)}
        className={s.button}
      >
        <button.Icon />
        {button.title} Queue
      </Button>
    </div>
  )
}
