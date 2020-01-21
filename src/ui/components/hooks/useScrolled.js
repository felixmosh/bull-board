import { useState, useEffect } from 'react'

export default function useScrolled() {
  const [scrolled, setScrolled] = useState(
    typeof window === 'undefined' ? false : window.scrollY > 20,
  )

  function handleScroll() {
    setScrolled(window.scrollY > 20)
  }

  useEffect(() => {
    window.addEventListener('scroll', handleScroll)

    return () => {
      window.removeEventListener('scroll', handleScroll)
    }
  })

  return scrolled
}
