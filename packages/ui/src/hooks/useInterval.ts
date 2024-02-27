import { useEffect, useLayoutEffect, useRef } from 'react';

/**
 * Based on https://usehooks-ts.com/react-hook/use-interval
 * */

export function useInterval(callback: () => void, delay: number | null, deps: any[] = []): void {
  const savedCallback = useRef(callback);

  // Remember the latest callback if it changes.
  useLayoutEffect(() => {
    savedCallback.current = callback;
  }, [callback]);

  // Set up the interval.
  useEffect(() => {
    savedCallback.current();

    // Don't schedule if no delay is specified.
    if (delay === null) {
      return;
    }
    let isLastFinished = true;

    const id = setInterval(async () => {
      if (!isLastFinished) {
        return;
      }

      isLastFinished = false;
      try {
        await savedCallback.current();
      } finally {
        isLastFinished = true;
      }
    }, delay);

    return () => {
      clearInterval(id);
    };
  }, [delay, ...deps]);
}
