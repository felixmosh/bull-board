import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

export function useScrollTopOnNav(): void {
  const { key } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [key]);
}
