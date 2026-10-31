import { attachOrderNamespace } from './order.socket.js';
import type { OrderNotificationsService } from '../modules/orders/order-notifications.service.js';
import type { AdminAuctionsService } from '../modules/admin-auctions/admin-auctions.service.js';
import { createAdminAuctionPublication } from './admin-auction.publication.js';
import type { Server as HttpServer } from 'node:http';
import { Server, type Socket } from 'socket.io';
import { decodeJwt } from 'jose';
import { ApiError } from '../http/api-error.js';
import type { AuthConfiguration } from '../config/auth-environment.js';
import type { RealtimeConfiguration } from '../config/realtime-environment.js';
import type { AuthService, AuthPrincipal } from '../modules/auth/auth.service.js';
import type { AuctionService } from '../modules/auctions/auction.service.js';
import { unauthorized } from '../modules/auth/auth.service.js';
import { createSocketLimits, type SocketLimits } from './auction.limits.js';
import { createAuctionPublication } from './auction.publication.js';
import { allowSocketRequest, socketPeer, safeSocketError } from './socket.security.js';
import { roomRequest, bidRequest, handshakeAuth, adminWatchRequest } from './auction.protocol.js';
import type { ClientEvents, ServerEvents, Reply, BidAccepted } from './auction.protocol.js';

type AuctionSocket = Socket<ClientEvents, ServerEvents>;
interface Session {
  token: string;
  user: AuthPrincipal;
  ip: string;
  joined: Set<string>;
  versions: Map<string, number>;
  release: () => void;
  expiry?: NodeJS.Timeout;
  tail: Promise<void>;
  queued: number;
}
export function attachAuctionSockets(
  http: HttpServer,
  service: AuctionService,
  auth: AuthService,
  security: AuthConfiguration,
  config: RealtimeConfiguration,
  options: SocketLimits = {},
  oversight?: Pick<AdminAuctionsService, 'versions'>,
  orders?: OrderNotificationsService,
) {
  const limits = createSocketLimits(options),
    sessions = new WeakMap<AuctionSocket, Session>();
  const administrators = new Set<AuctionSocket>();
  const rooms = new Map<string, Set<AuctionSocket>>(),
    jobs = new Set<Promise<void>>();
  let stopped = false,
    authCheck: Promise<void> | undefined;
  const io = new Server<ClientEvents, ServerEvents>(http, {
    path: '/socket.io',
    serveClient: false,
    maxHttpBufferSize: 16384,
    connectTimeout: 5000,
    cors: { origin: [...security.allowedOrigins], methods: ['GET', 'POST'], credentials: false },
    allowRequest(req, callback) {
      try {
        if (stopped || !allowSocketRequest(req, security))
          return callback('Ligação não permitida.', false);
        limits.attempt(socketPeer(req, security).ip);
        callback(null, true);
      } catch {
        callback('Ligação não permitida.', false);
      }
    },
  });
  const orderNamespace = orders
    ? attachOrderNamespace(io, orders, auth, security, config, options)
    : undefined;
  // O namespace público não concede uma ligação alternativa sem autenticação.
  io.use((_socket, next) => next(new Error('Namespace indisponível.')));
  const namespace = io.of('/auctions');
  const roomName = (id: string) => 'leilao:' + id;
  function fail(socket: AuctionSocket, error: unknown, disconnect = false) {
    if (socket.connected) socket.emit('auction:error', safeSocketError(error));
    if (disconnect) socket.disconnect(true);
  }
  async function identity(socket: AuctionSocket) {
    const session = sessions.get(socket);
    if (!session || stopped || !socket.connected) throw unauthorized();
    try {
      session.user = await auth.authenticate(session.token);
      return session.user;
    } catch (error) {
      fail(socket, error, true);
      throw error;
    }
  }
  async function administrator(socket: AuctionSocket) {
    const user = await identity(socket);
    if (!user.papeis.includes('administrador'))
      throw new ApiError(403, 'ACESSO_PROIBIDO', 'Não tens acesso a esta subscrição.');
  }
  const adminPublication = oversight
    ? createAdminAuctionPublication(service, oversight, {
        active: () => administrators.size > 0,
        async emit() {
          await Promise.all(
            [...administrators].map(async (socket) => {
              try {
                await administrator(socket);
                if (socket.connected && administrators.has(socket))
                  socket.emit('admin:auctions:changed', { consultar: true });
              } catch (error) {
                administrators.delete(socket);
                fail(socket, error, true);
              }
            }),
          );
        },
      })
    : undefined;
  function remove(socket: AuctionSocket, id: string) {
    const s = sessions.get(socket);
    s?.joined.delete(id);
    s?.versions.delete(id);
    const members = rooms.get(id);
    members?.delete(socket);
    if (!members?.size) {
      rooms.delete(id);
      publication.forget(id);
    }
  }
  async function presence(id: string) {
    const members = [...(rooms.get(id) ?? [])];
    await Promise.all(
      members.map(async (socket) => {
        try {
          await identity(socket);
          if (socket.connected && sessions.get(socket)?.joined.has(id))
            socket.emit('auction:presence', { leilaoId: id, ligacoes: rooms.get(id)?.size ?? 0 });
        } catch {
          /* Fail closed. */
        }
      }),
    );
  }
  const publication = createAuctionPublication(
    service,
    {
      rooms: () => rooms.keys(),
      hasRoom: (id) => rooms.has(id),
      async emit(state) {
        await Promise.all(
          [...(rooms.get(state.leilaoId) ?? [])].map(async (socket) => {
            try {
              await identity(socket);
              const s = sessions.get(socket)!,
                current = publication.latest(state.leilaoId, state);
              if (
                !socket.connected ||
                !s.joined.has(current.leilaoId) ||
                current.versao <= (s.versions.get(current.leilaoId) ?? -1)
              )
                return;
              s.versions.set(current.leilaoId, current.versao);
              socket.emit(
                current.estado === 'terminado' ? 'auction:ended' : 'auction:updated',
                current,
              );
            } catch {
              /* Não divulgar um estado privado após falha de autenticação. */
            }
          }),
        );
      },
      unavailable(id) {
        for (const socket of rooms.get(id) ?? [])
          fail(
            socket,
            new ApiError(
              503,
              'SERVICO_INDISPONIVEL',
              'Não foi possível atualizar o leilão. Solicita novamente o estado.',
            ),
          );
      },
    },
    config.syncIntervalMs,
  );
  namespace.use(async (socket, next) => {
    try {
      const parsed = handshakeAuth.safeParse(socket.handshake.auth);
      if (!parsed.success) throw unauthorized();
      const user = await auth.authenticate(parsed.data.token);
      if (stopped || socket.conn.readyState !== 'open') throw unauthorized();
      const ip = socketPeer(socket.request, security).ip,
        release = limits.acquire(ip, user.id);
      sessions.set(socket, {
        token: parsed.data.token,
        user,
        ip,
        joined: new Set(),
        versions: new Map(),
        release,
        tail: Promise.resolve(),
        queued: 0,
      });
      socket.conn.once('close', release);
      next();
    } catch (error) {
      const e = new Error('Não foi possível ligar ao serviço de leilões.') as Error & {
        data: unknown;
      };
      e.data = safeSocketError(error);
      next(e);
    }
  });
  const known = new Set([
    'auction:join',
    'auction:leave',
    'auction:state',
    'auction:bid',
    ...(oversight ? ['admin:auctions:watch'] : []),
  ]);
  namespace.on('connection', (socket) => {
    const s = sessions.get(socket)!;
    const exp = decodeJwt(s.token).exp! * 1000;
    s.expiry = setTimeout(() => fail(socket, unauthorized(), true), Math.max(0, exp - Date.now()));
    s.expiry.unref();
    socket.once('disconnect', () => {
      administrators.delete(socket);
      clearTimeout(s.expiry);
      s.release();
      const previous = [...s.joined];
      for (const id of previous) remove(socket, id);
      for (const id of previous) void presence(id);
    });
    function dispatch(event: string, args: unknown[]) {
      const ack =
        typeof args.at(-1) === 'function'
          ? (args.at(-1) as (result: Reply<unknown>) => void)
          : undefined;
      function reject(error: unknown) {
        const erro = safeSocketError(error);
        if (event === 'auction:bid' && erro.status >= 500) erro.resultadoIncerto = true;
        if (socket.connected) {
          ack?.({ ok: false, erro });
          if (event === 'auction:bid') {
            const parsed = bidRequest.safeParse(args[0]);
            socket.emit(erro.resultadoIncerto ? 'auction:bid:uncertain' : 'auction:bid:rejected', {
              ...(parsed.success
                ? { leilaoId: parsed.data.leilaoId, requestId: parsed.data.requestId }
                : {}),
              erro,
            });
          } else socket.emit('auction:error', erro);
        }
      }
      try {
        limits.event(s.ip, s.user.id, event === 'auction:bid');
        if (stopped) throw new ApiError(503, 'SERVICO_INDISPONIVEL', 'O serviço está a encerrar.');
        if (s.queued >= limits.limits.queuedPerSocket)
          throw new ApiError(
            429,
            'PEDIDOS_PENDENTES',
            'Aguarda a conclusão dos pedidos anteriores.',
          );
        if (!known.has(event) || !ack || args.length !== 2)
          throw new ApiError(400, 'EVENTO_INVALIDO', 'Evento ou acknowledgement inválido.');
        if (Buffer.byteLength(JSON.stringify(args[0]) ?? '', 'utf8') > 8192)
          throw new ApiError(413, 'PEDIDO_DEMASIADO_GRANDE', 'O evento excede o limite permitido.');
      } catch (error) {
        reject(error);
        return;
      }
      s.queued++;
      const job = s.tail
        .then(async () => {
          try {
            const user = await identity(socket);
            if (event === 'admin:auctions:watch') {
              if (!oversight || !adminWatchRequest.safeParse(args[0]).success)
                throw new ApiError(400, 'PEDIDO_INVALIDO', 'Verifica os campos da subscrição.');
              await administrator(socket);
              administrators.add(socket);
              ack!({ ok: true, data: { subscrito: true } });
              return;
            }
            const parsed = (event === 'auction:bid' ? bidRequest : roomRequest).safeParse(args[0]);
            if (!parsed.success)
              throw new ApiError(400, 'PEDIDO_INVALIDO', 'Verifica os campos do evento.');
            const id = parsed.data.leilaoId;
            if (event === 'auction:leave') {
              await socket.leave(roomName(id));
              remove(socket, id);
              ack!({ ok: true, data: { leilaoId: id } });
              await presence(id);
              return;
            }
            if (event === 'auction:join') {
              if (!s.joined.has(id) && s.joined.size >= limits.limits.roomsPerSocket)
                throw new ApiError(
                  429,
                  'SALAS_EXCEDIDAS',
                  'Já acompanhas o máximo de leilões permitido.',
                );
              // Existência validada antes da inscrição; a releitura após join cobre commits concorrentes.
              await service.snapshot(id);
              await identity(socket);
              s.joined.add(id);
              const members = rooms.get(id) ?? new Set();
              members.add(socket);
              rooms.set(id, members);
              await socket.join(roomName(id));
              try {
                const state = publication.latest(id, await publication.state(id));
                await identity(socket);
                if (!socket.connected || !s.joined.has(id)) return;
                s.versions.set(id, Math.max(state.versao, s.versions.get(id) ?? -1));
                ack!({ ok: true, data: publication.latest(id, state) });
                await presence(id);
              } catch (error) {
                await socket.leave(roomName(id));
                remove(socket, id);
                throw error;
              }
              return;
            }
            if (!s.joined.has(id))
              throw new ApiError(403, 'SALA_OBRIGATORIA', 'Entra primeiro no leilão autorizado.');
            if (event === 'auction:bid') {
              const input = bidRequest.parse(args[0]);
              const accepted = await service.bid(
                user,
                id,
                { valorCent: input.valorCent },
                input.requestId,
              );
              // Usar o snapshot da transação confirmada mesmo se uma leitura posterior falhar.
              const state = publication.latest(id, accepted.snapshot);
              await identity(socket);
              const receipt: BidAccepted = {
                requestId: input.requestId,
                origem: accepted.body.origem,
                licitacao: accepted.body.licitacao,
                estado: publication.latest(id, state),
              };
              if (socket.connected) {
                ack!({ ok: true, data: receipt });
                socket.emit('auction:bid:accepted', receipt);
              }
              publication.notify(id);
              return;
            }
            const state = publication.latest(id, await publication.state(id));
            await identity(socket);
            s.versions.set(id, Math.max(state.versao, s.versions.get(id) ?? -1));
            ack!({ ok: true, data: publication.latest(id, state) });
          } catch (error) {
            reject(error);
          }
        })
        .finally(() => {
          s.queued--;
          jobs.delete(job);
        });
      jobs.add(job);
      s.tail = job;
    }
    socket.onAny((event: string, ...args: unknown[]) => dispatch(event, args));
    socket.on('error', () =>
      fail(
        socket,
        new ApiError(400, 'EVENTO_INVALIDO', 'Não foi possível processar o evento.'),
        true,
      ),
    );
  });
  const authTimer = setInterval(() => {
    if (!authCheck && !stopped)
      authCheck = Promise.all(
        [...namespace.sockets.values()].map((socket) =>
          identity(socket)
            .then(() => undefined)
            .catch(() => undefined),
        ),
      )
        .then(() => undefined)
        .finally(() => {
          authCheck = undefined;
        });
  }, config.authIntervalMs);
  authTimer.unref();
  let shutdown: Promise<void> | undefined;
  return {
    io,
    get activeSockets() {
      return limits.activeSockets;
    },
    get roomCount() {
      return rooms.size;
    },
    close() {
      return (shutdown ??= (async () => {
        stopped = true;
        clearInterval(authTimer);
        namespace.disconnectSockets(true);
        await orderNamespace?.close();
        await Promise.allSettled([...jobs]);
        await authCheck;
        await adminPublication?.close();
        administrators.clear();
        await publication.close();
        rooms.clear();
        await new Promise<void>((resolve, reject) =>
          io.close((error) => {
            if (error && error.message !== 'Server is not running.') reject(error);
            else resolve();
          }),
        );
      })());
    },
  };
}
