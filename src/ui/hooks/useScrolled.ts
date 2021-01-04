import { useState, useEffect } from 'react'

export const useScrolled = (): boolean => {
  const [scrolled, setScrolled] = useState(
    typeof window === 'undefined' ? false : window.scrollY > 20,
  )

  useEffect(() => {
    let timeout: number

    function handleScroll() {
      if (timeout) {
        window.cancelAnimationFrame(timeout)
      }

      timeout = window.requestAnimationFrame(() => {
        setScrolled(window.scrollY > 20)
      })
    }

    window.addEventListener('scroll', handleScroll, false)

    return () => {
      window.removeEventListener('scroll', handleScroll)
    }
  })

  return scrolled
}
