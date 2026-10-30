import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useAuth } from '../auth/useAuth';
import { ApiFailure } from '../api/client';
import { objectId } from '../api/catalog-contract';
import { AdminUsersContext, type UserState } from './AdminUsersContext';
import { parseUserDetail, reasonError, adminApi } from './contracts';
const initial = (owner: string): UserState => ({
  owner,
  id: '',
  loading: false,
  busy: false,
  locked: false,
  reason: '',
  event: 0,
  revision: 0,
});
export function AdminUsersProvider({ children }: { children: ReactNode }) {
  const { session, request } = useAuth(),
    owner =
      session.kind === 'authenticated' && session.user.papeis.includes('administrador')
        ? session.user.id + ':' + session.expiresAt
        : '';
  const [state, setState] = useState(() => initial(owner));
  if (state.owner !== owner) setState(initial(owner));
  const reading = useRef<AbortController | null>(null),
    writing = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      reading.current?.abort();
      writing.current?.abort();
      reading.current = null;
      writing.current = null;
    },
    [owner],
  );
  const update = useCallback(
    (fn: (v: UserState) => UserState) => setState((v) => (v.owner === owner ? fn(v) : v)),
    [owner],
  );
  const load = useCallback(
    async (id: string, automatic = false) => {
      if (!owner || writing.current) return;
      reading.current?.abort();
      const c = new AbortController();
      reading.current = c;
      update((v) => ({
        ...v,
        id,
        loading: true,
        forbidden: false,
        ...(v.id === id
          ? {}
          : {
              data: undefined,
              reason: '',
              reasonError: undefined,
              feedback: undefined,
              locked: false,
            }),
        ...(!automatic ? { feedback: undefined } : {}),
      }));
      try {
        if (!objectId(id)) throw new ApiFailure('http', 404);
        const data = await request(adminApi + '/' + id, parseUserDetail, {}, c.signal);
        if (data.id !== id) throw new ApiFailure('invalid');
        if (!c.signal.aborted)
          update((v) => ({
            ...v,
            data,
            loading: false,
            locked: automatic ? v.locked : false,
            reason: v.data?.etag === data.etag ? v.reason : '',
            reasonError: undefined,
          }));
      } catch (error) {
        if (!c.signal.aborted)
          update((v) => ({
            ...v,
            loading: false,
            data: undefined,
            locked: true,
            forbidden: error instanceof ApiFailure && error.status === 403,
            event: v.event + 1,
            feedback: {
              kind: 'error',
              message:
                error instanceof ApiFailure && error.status === 403
                  ? 'A tua conta não tem acesso administrativo.'
                  : error instanceof ApiFailure && error.status === 404
                    ? 'Este utilizador não está disponível.'
                    : 'Não foi possível consultar a conta. Tenta novamente.',
            },
          }));
      } finally {
        if (reading.current === c) reading.current = null;
      }
    },
    [owner, request, update],
  );
  function edit(reason: string) {
    update((v) => ({ ...v, reason, reasonError: undefined }));
  }
  function validate() {
    const error = reasonError(state.reason);
    update((v) => ({ ...v, reasonError: error }));
    return !error;
  }
  async function change() {
    if (!owner || writing.current || reading.current || state.locked || !state.data || !validate())
      return;
    const original = state.data,
      c = new AbortController();
    writing.current = c;
    update((v) => ({ ...v, busy: true, locked: true, feedback: undefined }));
    try {
      const data = await request(
        adminApi + '/' + original.id + '/state',
        parseUserDetail,
        {
          method: 'PATCH',
          ifMatch: original.etag,
          body: { ativo: !original.ativo, motivo: state.reason.normalize('NFC').trim() },
        },
        c.signal,
      );
      if (data.id !== original.id || data.ativo === original.ativo) throw new ApiFailure('invalid');
      if (!c.signal.aborted)
        update((v) => ({
          ...v,
          data,
          busy: false,
          locked: false,
          reason: '',
          revision: v.revision + 1,
          event: v.event + 1,
          feedback: {
            kind: 'success',
            message: data.ativo
              ? 'A reativação foi confirmada pelo serviço.'
              : 'A desativação foi confirmada pelo serviço. A conta perdeu acesso às operações autenticadas.',
          },
        }));
    } catch (error) {
      if (!c.signal.aborted) {
        update((v) => ({
          ...v,
          busy: false,
          locked: true,
          revision: v.revision + 1,
          event: v.event + 1,
          forbidden: error instanceof ApiFailure && error.status === 403,
          feedback: {
            kind: 'error',
            message:
              error instanceof ApiFailure && error.codigo === 'AUTODESATIVACAO_PROIBIDA'
                ? 'Não podes desativar a tua própria conta.'
                : error instanceof ApiFailure && error.codigo === 'ULTIMO_ADMINISTRADOR'
                  ? 'É necessário preservar um administrador ativo.'
                  : error instanceof ApiFailure && [409, 412].includes(error.status ?? 0)
                    ? 'A conta mudou ou já tem esse estado. A tua alteração não foi confirmada. Consulta o estado atualizado.'
                    : 'Não foi possível confirmar a alteração. Consulta o estado antes de permitir outra ação.',
          },
        }));
        if (writing.current === c) writing.current = null;
        await load(original.id, true);
      }
    } finally {
      if (writing.current === c) writing.current = null;
    }
  }
  return (
    <AdminUsersContext value={{ state, load, edit, validate, change }}>
      {children}
    </AdminUsersContext>
  );
}
