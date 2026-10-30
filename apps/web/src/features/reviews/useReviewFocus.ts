import { useCallback, useEffect, useRef } from 'react';
/** Só move foco após navegação/decisão explícita e uma nova consulta confirmada. */
export function useReviewFocus(data: unknown) {
  const title = useRef<HTMLHeadingElement>(null),
    pending = useRef(false);
  const requestFocus = useCallback(() => {
    pending.current = true;
  }, []);
  useEffect(() => {
    if (data && pending.current && title.current) {
      pending.current = false;
      title.current.focus();
    }
  }, [data]);
  return { title, requestFocus };
}
