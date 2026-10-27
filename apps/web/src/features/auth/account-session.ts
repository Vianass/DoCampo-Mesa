import { authApi, type AuthApi, type Credentials } from './auth-api';
import { ApiFailure } from '../api/client';
import type { AccountSession } from './types';
interface Snapshot {
  session: AccountSession;
  notice?: string;
  reason?: 'logout' | 'expired' | 'invalid';
}
const cancelled = () => new DOMException('Pedido cancelado.', 'AbortError');
/** Token privado em memória; nenhuma persistência, decoding de papéis ou acesso por demonstração. */
export function createAccountSession(api: AuthApi = authApi, now: () => number = Date.now) {
  let state: Snapshot = { session: { kind: 'visitor' } },
    token: string | undefined,
    epoch = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending: { epoch: number; promise: Promise<void> } | undefined;
  const listeners = new Set<() => void>(),
    requests = new Set<AbortController>();
  function publish(next: Snapshot) {
    state = next;
    listeners.forEach((listener) => listener());
  }
  function invalidate() {
    epoch++;
    for (const controller of requests) controller.abort();
    requests.clear();
    clearTimeout(timer);
    pending = undefined;
    token = undefined;
    return epoch;
  }
  function clear(notice?: string, reason?: Snapshot['reason']) {
    invalidate();
    publish({ session: { kind: 'visitor' }, notice, reason });
  }
  function operation(signal?: AbortSignal) {
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) controller.abort();
    requests.add(controller);
    return {
      controller,
      done: () => {
        requests.delete(controller);
        signal?.removeEventListener('abort', abort);
      },
    };
  }
  function expired() {
    clear('A sessão terminou. Entra novamente para continuar.', 'expired');
  }
  async function login(credentials: Credentials, signal?: AbortSignal) {
    const version = invalidate();
    publish({ session: { kind: 'visitor' } });
    const op = operation(signal);
    try {
      const result = await api.login(credentials, op.controller.signal);
      if (version !== epoch || op.controller.signal.aborted) throw cancelled();
      const deadline = Date.parse(result.expiresAt);
      if (deadline <= now() || deadline > now() + 3_660_000) throw new ApiFailure('invalid');
      const user = await api.me(result.accessToken, op.controller.signal);
      if (version !== epoch || op.controller.signal.aborted) throw cancelled();
      if (user.id !== result.utilizador.id || deadline <= now()) throw new ApiFailure('invalid');
      token = result.accessToken;
      publish({
        session: { kind: 'authenticated', user, expiresAt: result.expiresAt, status: 'ready' },
      });
      timer = setTimeout(() => {
        if (version === epoch) expired();
      }, deadline - now());
      return user;
    } finally {
      op.done();
    }
  }
  function revalidate(): Promise<void> {
    if (!token || state.session.kind !== 'authenticated') return Promise.resolve();
    if (Date.parse(state.session.expiresAt) <= now()) {
      expired();
      return Promise.resolve();
    }
    if (pending?.epoch === epoch) return pending.promise;
    const currentToken = token,
      version = epoch,
      current = state.session,
      op = operation();
    publish({ session: { ...current, status: 'checking' } });
    const promise = (async () => {
      try {
        const user = await api.me(currentToken, op.controller.signal);
        if (version !== epoch || op.controller.signal.aborted) return;
        if (user.id !== current.user.id) throw new ApiFailure('invalid');
        if (Date.parse(current.expiresAt) <= now()) {
          expired();
          return;
        }
        publish({ session: { ...current, user, status: 'ready' } });
      } catch (error) {
        if (version !== epoch || op.controller.signal.aborted) return;
        if (error instanceof ApiFailure && error.status === 401) {
          clear('A sessão deixou de ser válida. Entra novamente para continuar.', 'invalid');
        } else
          publish({
            session: {
              ...current,
              status:
                error instanceof ApiFailure && error.status === 403 ? 'forbidden' : 'unavailable',
            },
          });
      } finally {
        op.done();
        if (pending?.epoch === version) pending = undefined;
      }
    })();
    pending = { epoch: version, promise };
    return promise;
  }
  async function logout() {
    const previous = token;
    const version = invalidate();
    publish({
      session: { kind: 'visitor' },
      reason: 'logout',
      notice:
        'Sessão encerrada neste navegador. O acesso anterior não é revogado pelo serviço e pode manter-se válido até expirar.',
    });
    if (!previous) return;
    const op = operation();
    try {
      await api.logout(previous, op.controller.signal);
    } catch {
      if (epoch === version && !op.controller.signal.aborted)
        publish({
          session: { kind: 'visitor' },
          reason: 'logout',
          notice:
            'Sessão encerrada neste navegador. Não foi possível confirmar a saída no serviço; o acesso anterior pode manter-se válido até expirar.',
        });
    } finally {
      op.done();
    }
  }
  return {
    getSnapshot: () => state,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    login,
    revalidate,
    logout,
    dispose: () => clear(),
  };
}
