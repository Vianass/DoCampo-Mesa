import { useEffect, useState } from 'react';
import { useAuth } from '../auth/useAuth';
import { ApiFailure } from '../api/client';
import {
  adminApplicationsApi,
  parseApplicationList,
  queryString,
  type ApplicationList,
  type ApplicationQuery,
} from './contracts';
import { useAdminApplications } from './useAdminApplications';
export function useApplicationList(query: ApplicationQuery) {
  const { session, request } = useAuth(),
    { state } = useAdminApplications();
  const owner =
    session.kind === 'authenticated' && session.user.papeis.includes('administrador')
      ? session.user.id + ':' + session.expiresAt
      : '';
  const [revision, refresh] = useState(0),
    [resource, setResource] = useState<{
      key: string;
      data?: ApplicationList;
      error?: string;
      forbidden?: boolean;
    }>({ key: '' });
  const search = queryString(query),
    key = JSON.stringify([owner, search, state.revision, revision]);
  useEffect(() => {
    if (!owner) return;
    const controller = new AbortController();
    void request(adminApplicationsApi + '?' + search, parseApplicationList, {}, controller.signal)
      .then((data) => {
        const requested = new URLSearchParams(search);
        if (
          data.pagina !== Number(requested.get('pagina')) ||
          data.porPagina !== Number(requested.get('porPagina')) ||
          (requested.has('estado') &&
            data.itens.some((item) => item.estado !== requested.get('estado')))
        )
          throw new ApiFailure('invalid');
        if (!controller.signal.aborted) setResource({ key, data });
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setResource({
            key,
            forbidden: error instanceof ApiFailure && error.status === 403,
            error:
              error instanceof ApiFailure && error.status === 403
                ? 'A tua conta não tem acesso administrativo a estas candidaturas.'
                : 'Não foi possível consultar as candidaturas. Tenta novamente.',
          });
      });
    return () => controller.abort();
  }, [owner, key, search, request]);
  const current = owner && resource.key === key ? resource : undefined;
  return {
    data: current?.data,
    error: current?.error,
    forbidden: current?.forbidden,
    loading: !current,
    retry: () => refresh((value) => value + 1),
  };
}
