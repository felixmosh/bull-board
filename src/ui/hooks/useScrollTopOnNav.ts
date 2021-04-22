import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

export function useScrollTopOnNav(): void {
  const { pathname } = useLocation()

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])
}
