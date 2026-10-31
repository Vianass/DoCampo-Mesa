import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../auth/useAuth';
import { ApiFailure } from '../api/client';
import { managementError } from './contracts';
import type { JsonRequestOptions, JsonResponseMetadata } from '../api/client';
import { catalogChanged, onCatalogRefresh } from '../api/catalog-events';
import { useOrderUpdates } from '../orders/OrderUpdatesContext';
export function useManagement<T>(
  path: string,
  parse: (v: unknown, m: JsonResponseMetadata) => T,
  live = true,
) {
  const { request, session } = useAuth(),
    owner = session.kind === 'authenticated' ? session.user.id : '',
    [revision, setRevision] = useState(0),
    [resource, setResource] = useState<{ key: string; data?: T; error?: string }>();
  const orderRevision = useOrderUpdates().revision;
  const key = owner + path + revision + ':' + (live ? orderRevision : 0),
    parser = useRef(parse);
  useEffect(() => {
    parser.current = parse;
  }, [parse]);
  useEffect(() => {
    const controller = new AbortController();
    void request(path, (v, m) => parser.current(v, m), {}, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setResource({ key, data });
      })
      .catch((e) => {
        if (!controller.signal.aborted)
          setResource({
            key,
            error:
              e instanceof ApiFailure && e.status === 404
                ? 'Este recurso não está disponível na tua produção.'
                : managementError(e),
          });
      });
    return () => controller.abort();
  }, [key, path, request]);
  useEffect(() => {
    if (!live) return;
    const refresh = () => setRevision((v) => v + 1),
      stop = onCatalogRefresh(refresh);
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') refresh();
    }, 15000);
    return () => {
      stop();
      clearInterval(timer);
    };
  }, [live]);
  const current = resource?.key === key ? resource : undefined;
  return {
    data: current?.data,
    error: current?.error,
    loading: !current,
    refresh: () => setRevision((v) => v + 1),
  };
}
export function useManagementMutation() {
  const { request } = useAuth(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [blocked, setBlocked] = useState(false),
    pending = useRef<AbortController | undefined>(undefined);
  useEffect(() => () => pending.current?.abort(), []);
  return {
    busy,
    error,
    blocked,
    clearError: () => setError(''),
    async run<T>(
      path: string,
      parse: (v: unknown, m: JsonResponseMetadata) => T,
      options: JsonRequestOptions,
      done: (value: T) => void,
    ) {
      if (pending.current || blocked) return;
      const c = new AbortController();
      pending.current = c;
      setBusy(true);
      setError('');
      try {
        const value = await request(path, parse, options, c.signal);
        if (!c.signal.aborted) {
          done(value);
          catalogChanged();
        }
      } catch (e) {
        if (!c.signal.aborted) {
          setError(managementError(e));
          setBlocked(
            !(e instanceof ApiFailure) ||
              e.status === undefined ||
              e.status >= 500 ||
              [409, 412].includes(e.status),
          );
        }
      } finally {
        if (!c.signal.aborted) {
          pending.current = undefined;
          setBusy(false);
        }
      }
    },
  };
}
