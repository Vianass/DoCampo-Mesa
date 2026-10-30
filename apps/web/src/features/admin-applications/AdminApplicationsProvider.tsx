import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ApiFailure } from '../api/client';
import { objectId } from '../api/catalog-contract';
import { useAuth } from '../auth/useAuth';
import { AdminApplicationsContext, type AdministrativeState } from './AdminApplicationsContext';
import {
  adminApplicationsApi,
  parseAdministrativeApplication,
  rejectionReason,
  validateRejection,
  type Decision,
} from './contracts';
const initial = (owner: string): AdministrativeState => ({
  owner,
  id: '',
  status: 'idle',
  reason: '',
  busy: false,
  locked: false,
  revision: 0,
  event: 0,
});
export function AdminApplicationsProvider({ children }: { children: ReactNode }) {
  const { session, request } = useAuth();
  const owner =
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
    (fn: (value: AdministrativeState) => AdministrativeState) =>
      setState((value) => (value.owner === owner ? fn(value) : value)),
    [owner],
  );
  const load = useCallback(
    async (id: string, automatic = false) => {
      if (!owner || writing.current) return;
      reading.current?.abort();
      const controller = new AbortController();
      reading.current = controller;
      update((value) => ({
        ...value,
        id,
        status: 'loading',
        data: value.id === id ? value.data : undefined,
        forbidden: false,
        ...(value.id === id
          ? {}
          : {
              reason: '',
              reasonVersion: undefined,
              reasonError: undefined,
              feedback: undefined,
              locked: false,
            }),
        ...(!automatic ? { feedback: undefined } : {}),
      }));
      try {
        if (!objectId(id)) throw new ApiFailure('http', 404);
        const data = await request(
          adminApplicationsApi + '/' + id,
          parseAdministrativeApplication,
          {},
          controller.signal,
        );
        if (data.id !== id) throw new ApiFailure('invalid');
        if (!controller.signal.aborted)
          update((value) => ({
            ...value,
            status: 'ready',
            data,
            locked: automatic ? value.locked : false,
            reason:
              data.estado === 'pendente' &&
              (!value.reasonVersion || value.reasonVersion === data.etag)
                ? value.reason
                : '',
            reasonVersion: data.etag,
            reasonError: undefined,
          }));
      } catch (error) {
        if (!controller.signal.aborted)
          update((value) => ({
            ...value,
            status: 'error',
            data: undefined,
            locked: true,
            forbidden: error instanceof ApiFailure && error.status === 403,
            event: value.event + 1,
            feedback: {
              kind: 'error',
              message:
                error instanceof ApiFailure && error.status === 404
                  ? 'Esta candidatura não está disponível.'
                  : error instanceof ApiFailure && error.status === 403
                    ? 'A tua conta não tem acesso administrativo a estas candidaturas.'
                    : 'Não foi possível consultar a candidatura. Tenta novamente; nenhuma decisão será repetida automaticamente.',
            },
          }));
      } finally {
        if (reading.current === controller) reading.current = null;
      }
    },
    [owner, request, update],
  );
  function editReason(reason: string) {
    update((value) => ({
      ...value,
      reason,
      reasonVersion: value.data?.etag,
      reasonError: undefined,
    }));
  }
  function validateReason() {
    const reasonError = validateRejection(state.reason);
    update((value) => ({ ...value, reasonError }));
    return !reasonError;
  }
  async function decide(decision: Decision) {
    if (
      !owner ||
      writing.current ||
      reading.current ||
      state.status !== 'ready' ||
      state.locked ||
      !state.data ||
      state.data.estado !== 'pendente'
    )
      return;
    if (decision === 'rejeitado' && !validateReason()) return;
    const controller = new AbortController();
    writing.current = controller;
    const original = state.data;
    update((value) => ({ ...value, busy: true, locked: true, feedback: undefined }));
    try {
      const data = await request(
        adminApplicationsApi +
          '/' +
          original.id +
          (decision === 'aprovado' ? '/approve' : '/reject'),
        parseAdministrativeApplication,
        {
          method: 'POST',
          body: decision === 'aprovado' ? {} : { justificacao: rejectionReason(state.reason) },
          ifMatch: original.etag,
        },
        controller.signal,
      );
      if (data.id !== original.id || data.estado !== decision) throw new ApiFailure('invalid');
      if (!controller.signal.aborted)
        update((value) => ({
          ...value,
          status: 'ready',
          data,
          busy: false,
          locked: false,
          reason: '',
          revision: value.revision + 1,
          event: value.event + 1,
          feedback: {
            kind: 'success',
            message:
              decision === 'aprovado'
                ? 'A aprovação foi confirmada pelo serviço. O candidato pode confirmar as novas capacidades na sua sessão.'
                : 'A rejeição foi confirmada pelo serviço. O candidato pode consultar o motivo e reapresentar a candidatura.',
          },
        }));
    } catch (error) {
      if (!controller.signal.aborted) {
        update((value) => ({
          ...value,
          busy: false,
          locked: true,
          revision: value.revision + 1,
          event: value.event + 1,
          feedback: {
            kind: 'error',
            message:
              error instanceof ApiFailure && [409, 412].includes(error.status ?? 0)
                ? error.codigo === 'CANDIDATO_INELEGIVEL'
                  ? 'A conta candidata já não é elegível. A decisão não foi confirmada; consulta o estado atualizado.'
                  : 'A candidatura mudou ou já foi decidida. A tua decisão não foi confirmada. Revê o estado apresentado antes de continuar.'
                : 'Não foi possível confirmar a decisão. Revê o estado da candidatura antes de permitir outra ação.',
          },
        }));
        if (writing.current === controller) writing.current = null;
        await load(original.id, true);
      }
    } finally {
      if (writing.current === controller) writing.current = null;
    }
  }
  return (
    <AdminApplicationsContext value={{ state, load, editReason, validateReason, decide }}>
      {children}
    </AdminApplicationsContext>
  );
}
