import { useState, useEffect } from 'react'

export const useScrolled = () => {
  const [scrolled, setScrolled] = useState(
    typeof window === 'undefined' ? false : window.scrollY > 20,
  )

  const handleScroll = () => setScrolled(window.scrollY > 20)

  useEffect(() => {
    window.addEventListener('scroll', handleScroll)

    return () => {
      window.removeEventListener('scroll', handleScroll)
    }
  })

  return scrolled
}
