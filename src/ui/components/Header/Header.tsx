import React, { PropsWithChildren } from 'react'
import s from './Header.module.css'

export const Header = ({ children }: PropsWithChildren<any>) => {
  return (
    <header className={s.header}>
      <div className={s.logo}>🎯 Bull Dashboard</div>
      {children}
    </header>
  )
}
