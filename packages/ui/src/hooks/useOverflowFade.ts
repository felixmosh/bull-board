import { useLayoutEffect, useRef, useState } from 'react';

export interface OverflowEdges {
  /** Content is hidden past the leading edge. */
  start: boolean;
  /** Content is hidden past the trailing edge. */
  end: boolean;
}

/**
 * Reports which edges of a horizontal scroller still have content beyond them, so an overflow
 * fade can be drawn only where there is something to fade into. A fade sitting at an edge that
 * is already at the end of its travel is a lie: it dims the first tab, and its hover and
 * selected states with it, to signal a scroll that cannot happen.
 */
export function useOverflowFade<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [edges, setEdges] = useState<OverflowEdges>({ start: false, end: false });

  const measure = () => {
    const element = ref.current;
    if (!element) {
      return;
    }

    // Fractional layout leaves scrollLeft a hair short of either end, so both ends need slack
    // rather than an exact comparison.
    const max = element.scrollWidth - element.clientWidth;
    const next = { start: element.scrollLeft > 1, end: element.scrollLeft < max - 1 };

    setEdges((prev) => (prev.start === next.start && prev.end === next.end ? prev : next));
  };

  // No dependency array: tabs come and go and their counts change width without the scroller
  // itself resizing, and every one of those moves the ends. `measure` bails when nothing
  // changed, so this settles after one pass instead of looping.
  useLayoutEffect(measure);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) {
      return;
    }

    element.addEventListener('scroll', measure, { passive: true });
    const observer = new ResizeObserver(measure);
    observer.observe(element);

    return () => {
      element.removeEventListener('scroll', measure);
      observer.disconnect();
    };
  }, []);

  return [ref, edges] as const;
}
