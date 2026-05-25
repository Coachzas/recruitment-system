import { useEffect, useRef } from 'react';

/**
 * Calls `fn` immediately and then every `intervalMs` milliseconds.
 * Stops when the component unmounts or deps change.
 */
export default function usePolling(fn, intervalMs = 30_000, deps = []) {
  const savedFn = useRef(fn);
  useEffect(() => { savedFn.current = fn; }, [fn]);

  useEffect(() => {
    savedFn.current();
    const id = setInterval(() => savedFn.current(), intervalMs);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intervalMs, ...deps]);
}
