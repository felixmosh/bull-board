import { useEffect, useState } from 'react';

export function useInView<T extends Element>() {
  const [element, ref] = useState<T | null>(null);
  const [inView, setInView] = useState(typeof IntersectionObserver === 'undefined');

  useEffect(() => {
    if (!element || typeof IntersectionObserver === 'undefined') {
      return;
    }

    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting));
    observer.observe(element);
    return () => observer.disconnect();
  }, [element]);

  return { ref, inView };
}
