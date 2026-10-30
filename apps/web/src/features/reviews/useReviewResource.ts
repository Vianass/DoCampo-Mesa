import { useEffect, useState } from 'react';
import { useAuth } from '../auth/useAuth';
import { ApiFailure, type JsonResponseMetadata } from '../api/client';
export function reviewError(e: unknown) {
  return e instanceof ApiFailure && e.status === 403
    ? 'A tua conta não tem acesso a esta operação.'
    : e instanceof ApiFailure && e.status === 404
      ? 'A avaliação ou compra não está disponível.'
      : e instanceof ApiFailure && e.status === 412
        ? 'A avaliação mudou. Consulta o estado atualizado antes de decidir.'
        : e instanceof ApiFailure && e.codigo === 'AVALIACAO_DUPLICADA'
          ? 'Esta compra já tem uma avaliação para esse alvo. Consulta o histórico.'
          : e instanceof ApiFailure && e.codigo === 'COMPRA_NAO_ELEGIVEL'
            ? 'A compra ainda não está concluída.'
            : 'Não foi possível confirmar o resultado. Consulta o estado antes de repetir.';
}
export function useReviewResource<T>(
  path: string,
  parse: (v: unknown, m: JsonResponseMetadata) => T,
  revision = 0,
) {
  const { session, request } = useAuth(),
    owner = session.kind === 'authenticated' ? session.user.id + ':' + session.expiresAt : '',
    [attempt, retry] = useState(0),
    key = JSON.stringify([owner, path, revision, attempt]);
  const [state, set] = useState<{ key: string; data?: T; error?: string; forbidden?: boolean }>();
  useEffect(() => {
    if (!owner) return;
    const c = new AbortController();
    void request(path, parse, {}, c.signal)
      .then((data) => {
        if (!c.signal.aborted) set({ key, data });
      })
      .catch((e) => {
        if (!c.signal.aborted)
          set({
            key,
            error: reviewError(e),
            forbidden: e instanceof ApiFailure && e.status === 403,
          });
      });
    return () => c.abort();
  }, [key, owner, path, parse, request]);
  const current = owner && state?.key === key ? state : undefined;
  return {
    data: current?.data,
    error: current?.error,
    forbidden: current?.forbidden,
    loading: !current,
    retry: () => retry((v) => v + 1),
  };
}
