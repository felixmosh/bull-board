import React from 'react'
import { Store } from '../../../hooks/useStore'
import { Button } from '../Button/Button'
import { Tooltip } from '../../Tooltip/Tooltip'
import { PauseIcon } from '../../Icons/Pause'
import { ResumeIcon } from '../../Icons/Resume'

interface Queues {
  name: string
  isPaused: boolean
}

interface ButtonType {
  title: string
  Icon: React.ElementType
  actionKey: 'pause' | 'resume'
}

const buttonTypes: Record<string, ButtonType> = {
  pause: { title: 'Pause', Icon: PauseIcon, actionKey: 'pause' },
  resume: { title: 'resume', Icon: ResumeIcon, actionKey: 'resume' },
}

export const MenuActions = ({
  queue,
  actions,
}: {
  queue: Queues
  actions: Store['actions']
}) => {
  const button = queue?.isPaused ? buttonTypes.resume : buttonTypes.pause
  return (
    <Tooltip title={button.title}>
      <Button onClick={actions[button.actionKey](queue.name)}>
        <button.Icon />
      </Button>
    </Tooltip>
  )
}
