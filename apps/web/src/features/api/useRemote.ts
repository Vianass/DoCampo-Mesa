import { useEffect, useRef, useState } from 'react';
import { ApiFailure } from './client';
export function useRemote<T>(key: string, load: (signal: AbortSignal) => Promise<T>, delay = 0) {
  const loader = useRef(load);
  useEffect(() => {
    loader.current = load;
  });
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{
    key: string;
    attempt: number;
    data?: T;
    error?: ApiFailure;
  }>();
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const timer = setTimeout(() => {
      void loader
        .current(controller.signal)
        .then((data) => {
          if (active) setResult({ key, attempt, data });
        })
        .catch((error) => {
          if (active)
            setResult({
              key,
              attempt,
              error: error instanceof ApiFailure ? error : new ApiFailure('invalid'),
            });
        });
    }, delay);
    return () => {
      active = false;
      clearTimeout(timer);
      controller.abort();
    };
  }, [key, attempt, delay]);
  const current = result?.key === key && result.attempt === attempt ? result : undefined;
  return {
    data: current?.data,
    error: current?.error,
    loading: !current,
    retry: () => setAttempt((n) => n + 1),
  };
}
