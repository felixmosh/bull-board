import React from 'react'
import s from './Header.module.css'
import cn from 'classnames'

import { useScrolled } from './hooks/useScrolled'

export const Header = () => {
  const scrolled = useScrolled()

  return (
    <header className={cn(s.header, { [s.floating]: scrolled })}>
      <nav>🎯 Bull Dashboard</nav>
    </header>
  )
}
