import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../auth/useAuth';
import { ApiFailure } from '../api/client';
function version(value: unknown) {
  return value && typeof value === 'object' && 'versao' in value && typeof value.versao === 'number'
    ? value.versao
    : undefined;
}
/** Conserva a última leitura no refresh de fundo, mas nunca entre sessões/consultas. */
export function useSupervisionResource<T>(path: string, parse: (v: unknown) => T, revision = 0) {
  const { session, request } = useAuth(),
    owner =
      session.kind === 'authenticated' && session.user.papeis.includes('administrador')
        ? session.user.id + ':' + session.expiresAt
        : '',
    key = owner + ':' + path;
  const [retry, setRetry] = useState(0),
    token = key + ':' + retry + ':' + revision;
  const [state, setState] = useState<{
    key: string;
    token: string;
    data?: T;
    error?: string;
    forbidden?: boolean;
  }>({ key: '', token: '' });
  const refresh = useCallback(() => setRetry((v) => v + 1), []);
  useEffect(() => {
    if (!owner) return;
    const c = new AbortController();
    void request(path, parse, {}, c.signal)
      .then((data) => {
        if (!c.signal.aborted)
          setState((old) => {
            const previous = old.key === key ? old.data : undefined;
            if (
              version(previous) !== undefined &&
              version(data) !== undefined &&
              version(data)! < version(previous)!
            )
              return {
                key,
                token,
                data: previous,
                error: 'O serviço devolveu uma versão anterior. Atualiza a consulta.',
              };
            return { key, token, data };
          });
      })
      .catch((error) => {
        if (!c.signal.aborted)
          setState((old) => {
            const denied = error instanceof ApiFailure && [401, 403].includes(error.status ?? 0);
            return {
              key,
              token,
              data: !denied && old.key === key ? old.data : undefined,
              forbidden: error instanceof ApiFailure && error.status === 403,
              error:
                error instanceof ApiFailure && error.status === 403
                  ? 'A tua conta não tem acesso administrativo.'
                  : error instanceof ApiFailure && error.status === 404
                    ? 'O leilão não está disponível.'
                    : error instanceof ApiFailure && error.status === 400
                      ? 'Revê os filtros e o endereço desta consulta.'
                      : 'Não foi possível confirmar os dados. Tenta novamente.',
            };
          });
      });
    return () => c.abort();
  }, [key, token, owner, path, parse, request]);
  const current = owner && state.key === key ? state : undefined,
    settled = current?.token === token;
  return {
    data: current?.data,
    error: settled ? current?.error : undefined,
    forbidden: current?.forbidden,
    loading: !current?.data && !settled,
    updating: !!current?.data && !settled,
    refresh,
  };
}
