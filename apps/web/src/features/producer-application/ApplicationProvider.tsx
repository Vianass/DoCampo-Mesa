import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useAuth } from '../auth/useAuth';
import { ApiFailure } from '../api/client';
import { ApplicationContext, type ApplicationState } from './ApplicationContext';
import {
  applicationInput,
  emptyInput,
  parseApplication,
  validateApplication,
  type ApplicationField,
} from './model';
const endpoint = '/me/producer-application';
const initial = (owner: string): ApplicationState => ({
  owner,
  status: 'idle',
  application: null,
  draft: emptyInput(),
  dirty: false,
  saving: false,
  uncertain: false,
  errors: {},
});

/** Apenas dados do formulário em memória. Sobrevive à confirmação da sessão; limpa na saída/troca de conta. */
export function ApplicationProvider({ children }: { children: ReactNode }) {
  const { session, request } = useAuth();
  const owner = session.kind === 'authenticated' ? session.user.id + ':' + session.expiresAt : '';
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
    (fn: (current: ApplicationState) => ApplicationState) => {
      setState((current) => (current.owner === owner ? fn(current) : current));
    },
    [owner],
  );
  const load = useCallback(async () => {
    if (!owner || writing.current) return;
    reading.current?.abort();
    const controller = new AbortController();
    reading.current = controller;
    update((current) => ({ ...current, status: 'loading', error: undefined, notice: undefined }));
    try {
      let application;
      try {
        application = await request(endpoint, parseApplication, {}, controller.signal);
      } catch (error) {
        if (!(
          error instanceof ApiFailure &&
          error.status === 404 &&
          error.codigo === 'CANDIDATURA_NAO_ENCONTRADA'
        ))
          throw error;
        application = null;
      }
      if (controller.signal.aborted) return;
      update((current) => ({
        ...current,
        status: 'ready',
        application,
        uncertain: false,
        draft: !current.dirty && application ? applicationInput(application) : current.draft,
      }));
      return application;
    } catch (error) {
      if (!controller.signal.aborted)
        update((current) => ({
          ...current,
          status: 'error',
          error:
            error instanceof ApiFailure && error.status === 403
              ? 'O serviço não autorizou a consulta da candidatura.'
              : 'Não foi possível consultar a candidatura. Tenta novamente.',
        }));
    } finally {
      if (reading.current === controller) reading.current = null;
    }
  }, [owner, request, update]);
  function edit(field: ApplicationField, value: string) {
    update((current) => {
      const errors = { ...current.errors };
      delete errors[field];
      return {
        ...current,
        draft: { ...current.draft, [field]: value },
        dirty: true,
        errors,
        notice: undefined,
      };
    });
  }
  async function submit() {
    if (
      writing.current ||
      reading.current ||
      !owner ||
      state.status !== 'ready' ||
      state.uncertain ||
      (state.application && state.application.estado !== 'rejeitado')
    )
      return;
    const errors = validateApplication(state.draft);
    update((current) => ({ ...current, errors, error: undefined, notice: undefined }));
    if (Object.keys(errors).length) return;
    const controller = new AbortController();
    writing.current = controller;
    update((current) => ({ ...current, saving: true }));
    try {
      const application = await request(
        endpoint,
        parseApplication,
        { method: 'POST', expectedStatus: 201, body: applicationInput(state.draft) },
        controller.signal,
      );
      if (!controller.signal.aborted)
        update((current) => ({
          ...current,
          application,
          status: 'ready',
          saving: false,
          uncertain: false,
          dirty: false,
          errors: {},
          draft: applicationInput(application),
          notice: 'Candidatura recebida. Podes acompanhar a análise neste espaço.',
        }));
    } catch (error) {
      if (controller.signal.aborted) return;
      const status = error instanceof ApiFailure ? error.status : undefined;
      const uncertain = status === 409 || status === undefined || status >= 500;
      const message =
        status === 409
          ? 'A candidatura pode já ter sido recebida ou decidida. Confirma o estado antes de continuar.'
          : uncertain
            ? 'Não foi possível confirmar a submissão. Confirma o estado antes de voltar a enviar.'
            : status === 400
              ? 'O serviço recusou os dados. Revê os cinco campos antes de voltar a enviar.'
              : status === 403
                ? 'O serviço não autorizou a submissão. Confirma o acesso à tua conta.'
                : status === 413
                  ? 'A candidatura excede o limite permitido. Contacta a administração antes de continuar.'
                  : 'Não foi possível enviar a candidatura. Tenta novamente.';
      update((current) => ({ ...current, saving: false, uncertain, error: message }));
    } finally {
      if (writing.current === controller) writing.current = null;
    }
  }
  return <ApplicationContext value={{ state, load, edit, submit }}>{children}</ApplicationContext>;
}
