import { useEffect, useState } from 'react';
import { userPageParser } from './contracts';
import { useAuth } from '../auth/useAuth';
import { ApiFailure, type JsonResponseMetadata } from '../api/client';
/** Consultas privadas canceláveis, vinculadas à sessão e à consulta atual. */
export function useAdminResource<T>(
  path: string,
  parse: (v: unknown, m: JsonResponseMetadata) => T,
  revision = 0,
  missingMessage = 'Este utilizador não está disponível.',
) {
  const { session, request } = useAuth(),
    owner =
      session.kind === 'authenticated' && session.user.papeis.includes('administrador')
        ? session.user.id + ':' + session.expiresAt
        : '';
  const [retry, setRetry] = useState(0),
    key = JSON.stringify([owner, path, revision, retry]);
  const [state, setState] = useState<{
    key: string;
    data?: T;
    error?: string;
    forbidden?: boolean;
  }>({ key: '' });
  useEffect(() => {
    if (!owner) return;
    const controller = new AbortController();
    void request(
      path,
      (value, metadata) => {
        if (path.startsWith('/admin/users?'))
          userPageParser(new URL(path, 'http://local').search)(value);
        return parse(value, metadata);
      },
      {},
      controller.signal,
    )
      .then((data) => {
        if (!controller.signal.aborted) setState({ key, data });
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setState({
            key,
            forbidden: error instanceof ApiFailure && error.status === 403,
            error:
              error instanceof ApiFailure && error.status === 403
                ? 'A tua conta não tem acesso administrativo.'
                : error instanceof ApiFailure && error.status === 404
                  ? missingMessage
                  : 'Não foi possível consultar estes dados. Tenta novamente.',
          });
      });
    return () => controller.abort();
  }, [key, owner, path, parse, request, missingMessage]);
  const current = owner && state.key === key ? state : undefined;
  return {
    data: current?.data,
    error: current?.error,
    forbidden: current?.forbidden,
    loading: !current,
    retry: () => setRetry((v) => v + 1),
  };
}
