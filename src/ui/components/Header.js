import React from 'react'
import useScrolled from './hooks/useScrolled'

export default function Header() {
  const scrolled = useScrolled()

  return (
    <nav
      id="header"
      style={{ boxShadow: scrolled ? '0 3px 3px rgba(0,0,0,0.1)' : 'none' }}
    >
      <span>🎯 Bull Dashboard</span>
    </nav>
  )
}
