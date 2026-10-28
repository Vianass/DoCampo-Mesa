import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../auth/useAuth';
import { createAuctionLiveClient, type LiveStatus } from './live-client';
import { fromDetail, type AuctionDetail, type AuctionSnapshot, type BidReceipt } from './contracts';
import { sampleClock, type ClockSample } from './model';
import { accountFingerprint, attemptStore, type BidAttempt } from './attempts';
export function useAuctionRoom(detail: AuctionDetail | undefined) {
  const auth = useAuth(),
    userId = auth.session.kind === 'authenticated' ? auth.session.user.id : '';
  const id = detail?.id;
  const { socketAuth, trackConnection, revalidate } = auth;
  const seed = useRef(detail);
  useEffect(() => {
    seed.current = detail;
  }, [detail]);
  const [resource, setResource] = useState<{
    key: string;
    state: AuctionSnapshot;
    clock: ClockSample;
    status: LiveStatus;
    presence: number;
    notice?: string;
    attempt?: BidAttempt;
    busy?: boolean;
    receipt?: BidReceipt;
  }>();
  const client = useRef<ReturnType<typeof createAuctionLiveClient> | undefined>(undefined),
    busy = useRef(false);
  const storage = useRef<ReturnType<typeof attemptStore<BidAttempt>> | undefined>(undefined);
  const scope = useRef('');
  const key = userId + ':' + (id ?? '');
  useEffect(() => {
    scope.current = key;
    const detail = seed.current;
    if (!id || !detail || !userId) return;
    let active = true;
    const initial = fromDetail(detail);
    const update = (f: (r: NonNullable<typeof resource>) => NonNullable<typeof resource>) => {
      if (active)
        setResource((r) =>
          f(
            r?.key === key
              ? r
              : {
                  key,
                  state: initial,
                  clock: sampleClock(initial.serverNow),
                  status: 'connecting',
                  presence: 0,
                },
          ),
        );
    };
    const connection = createAuctionLiveClient({
      id,
      initial,
      socketAuth,
      trackConnection,
      state: (state, received, sent) =>
        update((r) => ({ ...r, state, clock: sampleClock(state.serverNow, received, sent) })),
      status: (status) => update((r) => ({ ...r, status })),
      presence: (presence) => update((r) => ({ ...r, presence })),
      error: (error) => {
        if (error.status === 401) void revalidate();
        update((r) => ({
          ...r,
          notice:
            error.status === 401
              ? 'A sessão terminou. Entra novamente para continuar.'
              : error.status === 403
                ? 'A tua conta não tem autorização para esta operação.'
                : undefined,
        }));
      },
    });
    client.current = connection;
    void accountFingerprint(userId)
      .then((hash) => {
        if (!active) return;
        const store = attemptStore<BidAttempt>(hash, id);
        storage.current = store;
        const saved = store.read();
        const pending =
          saved &&
          saved.leilaoId === id &&
          Number.isSafeInteger(saved.valorCent) &&
          saved.valorCent > 0
            ? saved
            : undefined;
        update((r) => ({
          ...r,
          attempt: pending,
          notice: pending
            ? 'Ficou uma oferta por confirmar. Recupera o resultado antes de enviar outra.'
            : undefined,
        }));
        connection.connect();
      })
      .catch(() =>
        update((r) => ({
          ...r,
          status: 'disconnected',
          notice: 'Não foi possível preparar uma ligação segura. Tenta novamente.',
        })),
      );
    const focus = () => {
      if (document.visibilityState === 'visible') void connection.refresh();
    };
    window.addEventListener('focus', focus);
    document.addEventListener('visibilitychange', focus);
    return () => {
      active = false;
      connection.close();
      if (client.current === connection) client.current = undefined;
      storage.current = undefined;
      busy.current = false;
      window.removeEventListener('focus', focus);
      document.removeEventListener('visibilitychange', focus);
    };
    // O detalhe é a semente REST; as versões seguintes pertencem à mesma sala, sem recriar sockets por render.
  }, [key, id, userId, socketAuth, trackConnection, revalidate]);
  const current = resource?.key === key ? resource : undefined;
  async function submit(value?: number) {
    if (
      !current ||
      current.status !== 'connected' ||
      busy.current ||
      !client.current ||
      !storage.current
    )
      return;
    const attempt =
      current.attempt ??
      (value !== undefined
        ? { requestId: crypto.randomUUID(), leilaoId: id!, valorCent: value }
        : undefined);
    if (!attempt) return;
    if (!current.attempt && !storage.current.save(attempt)) {
      setResource({
        ...current,
        notice: 'Não foi possível preservar esta tentativa. A oferta não foi enviada.',
      });
      return;
    }
    busy.current = true;
    setResource({ ...current, attempt, busy: true, notice: 'A confirmar a tua oferta…' });
    const localKey = key,
      connection = client.current,
      store = storage.current;
    const response = await connection.bid(attempt);
    if (scope.current !== localKey || client.current !== connection) return;
    busy.current = false;
    if (response.ok) {
      store.clear(attempt.requestId);
      setResource((r) =>
        r
          ? {
              ...r,
              attempt: undefined,
              busy: false,
              receipt: response.data,
              notice: undefined,
            }
          : r,
      );
      void connection.refresh();
    } else if (response.erro.resultadoIncerto || response.erro.status >= 500) {
      setResource((r) =>
        r
          ? {
              ...r,
              attempt,
              busy: false,
              notice:
                'Ainda não foi possível confirmar esta oferta. Não envies outra: recupera o resultado com a mesma tentativa.',
            }
          : r,
      );
      void connection.refresh();
    } else {
      store.clear(attempt.requestId);
      setResource((r) =>
        r
          ? {
              ...r,
              attempt: undefined,
              busy: false,
              notice:
                response.erro.status === 409
                  ? 'A oferta não foi aceite: o valor ou o estado do leilão mudou. Revê a próxima oferta mínima.'
                  : response.erro.status === 403
                    ? 'Não tens autorização para licitar neste leilão.'
                    : response.erro.status === 429
                      ? 'Aguarda um momento antes de tentar novamente.'
                      : 'A oferta não foi aceite. Revê o valor e tenta novamente.',
            }
          : r,
      );
      void connection.refresh();
    }
  }
  const refresh = useCallback(() => client.current?.refresh(), []);
  return { ...current, submit, refresh };
}
