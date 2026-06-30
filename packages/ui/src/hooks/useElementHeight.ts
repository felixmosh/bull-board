import { type RefObject, useLayoutEffect, useRef, useState } from 'react';

export function useElementHeight<T extends HTMLElement>(): [RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [height, setHeight] = useState(0);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;

    const observer = new ResizeObserver(([entry]) => {
      setHeight(entry.contentRect.height);
    });
    observer.observe(element);
    setHeight(element.getBoundingClientRect().height);

    return () => observer.disconnect();
  }, []);

  return [ref, height];
}
