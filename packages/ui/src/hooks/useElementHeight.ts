import { type RefObject, useLayoutEffect, useRef, useState } from 'react';

export function useElementHeight<T extends HTMLElement>(): [RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [height, setHeight] = useState(0);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;

    // Border box, not `entry.contentRect`: callers position things below the element, so
    // padding counts. Reading the rect also keeps the observed value and the initial one
    // measuring the same box.
    const measure = () => setHeight(element.getBoundingClientRect().height);

    const observer = new ResizeObserver(measure);
    observer.observe(element);
    measure();

    return () => observer.disconnect();
  }, []);

  return [ref, height];
}
