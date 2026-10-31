import type { Server, Namespace, Socket } from 'socket.io';
import { decodeJwt } from 'jose';
import { ApiError } from '../http/api-error.js';
import type { AuthService } from '../modules/auth/auth.service.js';
import type { AuthConfiguration } from '../config/auth-environment.js';
import type { RealtimeConfiguration } from '../config/realtime-environment.js';
import type { OrderNotificationsService } from '../modules/orders/order-notifications.service.js';
import { unauthorized } from '../modules/auth/auth.service.js';
import { handshakeAuth, type ClientEvents, type ServerEvents } from './auction.protocol.js';
import { createSocketLimits, type SocketLimits } from './auction.limits.js';
import { socketPeer, safeSocketError } from './socket.security.js';
import {
  orderWatchInput,
  type OrderClientEvents,
  type OrderServerEvents,
  type OrderUpdate,
} from './order.protocol.js';

/** Namespace privado no mesmo servidor; nunca aceita nomes de sala ou identidades do cliente. */
export function attachOrderNamespace(
  io: Server<ClientEvents, ServerEvents>,
  service: OrderNotificationsService,
  auth: AuthService,
  security: AuthConfiguration,
  config: RealtimeConfiguration,
  options: SocketLimits = {},
) {
  type OrderSocket = Socket<OrderClientEvents, OrderServerEvents>;
  const namespace = io.of('/orders') as unknown as Namespace<OrderClientEvents, OrderServerEvents>,
    limits = createSocketLimits(options),
    jobs = new Set<Promise<unknown>>(),
    states = new Map<
      OrderSocket,
      {
        token: string;
        id: string;
        ip: string;
        watching: boolean;
        busy: boolean;
        polling: boolean;
        versions: Map<string, number>;
        expiry?: NodeJS.Timeout;
        release: () => void;
      }
    >();
  let stopped = false;
  function fail(socket: OrderSocket, error: unknown, close = false) {
    if (socket.connected) socket.emit('orders:error', safeSocketError(error));
    if (close) socket.disconnect(true);
  }
  async function identity(socket: OrderSocket) {
    const s = states.get(socket);
    if (!s || stopped || !socket.connected) throw unauthorized();
    const user = await auth.authenticate(s.token);
    if (!user.papeis.some((r) => r === 'comprador' || r === 'produtor'))
      throw new ApiError(403, 'ACESSO_PROIBIDO', 'Não tens acesso a esta subscrição.');
    return user;
  }
  namespace.use(async (socket, next) => {
    try {
      const parsed = handshakeAuth.safeParse(socket.handshake.auth);
      if (!parsed.success) throw unauthorized();
      const user = await auth.authenticate(parsed.data.token);
      if (stopped || socket.conn.readyState !== 'open') throw unauthorized();
      if (!user.papeis.some((r) => r === 'comprador' || r === 'produtor'))
        throw new ApiError(403, 'ACESSO_PROIBIDO', 'Não tens acesso a esta subscrição.');
      const ip = socketPeer(socket.request, security).ip,
        release = limits.acquire(ip, user.id);
      states.set(socket, {
        token: parsed.data.token,
        id: user.id,
        ip,
        watching: false,
        busy: false,
        polling: false,
        versions: new Map(),
        release,
      });
      socket.conn.once('close', release);
      next();
    } catch (e) {
      const error = new Error('Não foi possível ligar às encomendas.') as Error & { data: unknown };
      error.data = safeSocketError(e);
      next(error);
    }
  });
  async function poll(socket: OrderSocket) {
    const s = states.get(socket);
    if (!s || s.busy || s.polling) return;
    s.polling = true;
    try {
      const user = await identity(socket);
      if (!s.watching) return;
      const updates = await service.versions(user);
      // A consulta pode ter terminado depois de uma desativação/remoção de papel.
      const current = await identity(socket);
      if (current.papeis.join(',') !== user.papeis.join(',')) return;
      for (const update of updates) {
        if (!socket.connected || !s.watching) break;
        if (update.versao > (s.versions.get(update.encomendaId) ?? -1)) {
          s.versions.set(update.encomendaId, update.versao);
          socket.emit('order:updated', update);
        }
      }
      const ids = new Set(updates.map((r) => r.encomendaId));
      for (const id of s.versions.keys()) if (!ids.has(id)) s.versions.delete(id);
    } catch (e) {
      s.watching = false;
      fail(socket, e, e instanceof ApiError && [401, 403].includes(e.status));
    } finally {
      s.polling = false;
    }
  }
  function run(job: Promise<unknown>) {
    jobs.add(job);
    void job.finally(() => jobs.delete(job));
  }
  namespace.on('connection', (socket) => {
    const s = states.get(socket)!;
    s.expiry = setTimeout(
      () => fail(socket, unauthorized(), true),
      Math.max(0, decodeJwt(s.token).exp! * 1000 - Date.now()),
    );
    s.expiry.unref();
    socket.on('orders:watch', (input, ack) => {
      if (s.busy) {
        const error = new ApiError(429, 'PEDIDOS_PENDENTES', 'Aguarda a subscrição anterior.');
        if (typeof ack === 'function') ack({ ok: false, erro: safeSocketError(error) });
        return;
      }
      s.busy = true;
      run(
        (async () => {
          try {
            limits.event(s.ip, s.id, false);
            if (!orderWatchInput.safeParse(input).success || typeof ack !== 'function')
              throw new ApiError(400, 'EVENTO_INVALIDO', 'Subscrição inválida.');
            const user = await identity(socket),
              initial = await service.versions(user);
            const current = await identity(socket);
            if (current.papeis.join(',') !== user.papeis.join(','))
              throw new ApiError(403, 'ACESSO_PROIBIDO', 'As capacidades mudaram.');
            if (!socket.connected) return;
            s.versions = new Map(initial.map((r: OrderUpdate) => [r.encomendaId, r.versao]));
            await socket.join('encomendas:conta:' + s.id);
            s.watching = true;
            ack({ ok: true, data: { consultar: true } });
          } catch (e) {
            if (typeof ack === 'function' && socket.connected)
              ack({ ok: false, erro: safeSocketError(e) });
            fail(socket, e, e instanceof ApiError && [401, 403].includes(e.status));
          } finally {
            s.busy = false;
          }
        })(),
      );
    });
    socket.onAny((event: string) => {
      if (event !== 'orders:watch') {
        try {
          limits.event(s.ip, s.id, false);
        } catch (e) {
          fail(socket, e);
          return;
        }
        fail(socket, new ApiError(400, 'EVENTO_INVALIDO', 'Evento indisponível.'));
      }
    });
    socket.on('error', () =>
      fail(socket, new ApiError(400, 'EVENTO_INVALIDO', 'Evento inválido.'), true),
    );
    socket.once('disconnect', () => {
      clearTimeout(s.expiry);
      s.release();
      states.delete(socket);
    });
  });
  const timer = setInterval(
    () => {
      if (!stopped) for (const socket of states.keys()) run(poll(socket));
    },
    Math.min(config.syncIntervalMs, config.authIntervalMs),
  );
  timer.unref();
  return {
    async close() {
      stopped = true;
      clearInterval(timer);
      namespace.disconnectSockets(true);
      await Promise.allSettled([...jobs]);
      states.clear();
    },
  };
}
