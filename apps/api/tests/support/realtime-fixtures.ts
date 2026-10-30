import { createAdminAuctionsService } from '../../src/modules/admin-auctions/admin-auctions.service.js';
import { createAdminService } from '../../src/modules/admin/admin.service.js';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { io, type Socket as Client } from 'socket.io-client';
import { createApp } from '../../src/app.js';
import { parseEnvironment } from '../../src/config/environment.js';
import { connectDatabase } from '../../src/database/connection.js';
import { createAuthService } from '../../src/modules/auth/auth.service.js';
import { createAuctionService } from '../../src/modules/auctions/auction.service.js';
import { attachAuctionSockets } from '../../src/realtime/auction.socket.js';
import type { SocketLimits } from '../../src/realtime/auction.limits.js';
import type { ClientEvents, ServerEvents, Reply } from '../../src/realtime/auction.protocol.js';
import type { AuctionSnapshot } from '../../src/modules/auctions/auction.snapshot.js';
import { authConfiguration, authToken } from './auth-fixtures.js';
import { seedAuctionActors } from './auction-fixtures.js';

export type RealtimeClient = Client<ServerEvents, ClientEvents>;
export async function realtimeFixture(
  options: {
    limits?: SocketLimits;
    syncIntervalMs?: number;
    production?: boolean;
    adminSupervision?: boolean;
    lifecycle?: boolean;
  } = {},
) {
  const configuration = parseEnvironment({
    NODE_ENV: 'test',
    MONGODB_URI: 'mongodb://127.0.0.1:27019/?replicaSet=rs-dcm-test&directConnection=true',
    MONGODB_DB_NAME: 'docampo_test_socket_' + randomUUID().replaceAll('-', ''),
  });
  const database = await connectDatabase(configuration),
    connection = database.connection;
  const security = authConfiguration({
    production: options.production ?? false,
    allowedOrigins: ['http://localhost:5173'],
  });
  const auth = createAuthService(connection, security),
    service = createAuctionService(connection, security.secret);
  await auth.prepare();
  await service.prepare();
  const adminAuctions = options.adminSupervision
    ? createAdminAuctionsService(connection, security.secret)
    : undefined;
  const admin = options.adminSupervision
    ? createAdminService(connection, security.secret)
    : undefined;
  await admin?.prepare();
  const server = createServer(
    createApp({
      auth,
      auctions: service,
      admin,
      adminAuctions,
      security,
      auctionLimits: { ipLimit: 100000, accountLimit: 100000 },
    }),
  );
  const realtime = attachAuctionSockets(
    server,
    service,
    auth,
    security,
    { enabled: true, syncIntervalMs: options.syncIntervalMs ?? 100, authIntervalMs: 100 },
    {
      connectionAttempts: 100000,
      eventsPerIp: 100000,
      eventsPerAccount: 100000,
      bidsPerAccount: 100000,
      ...options.limits,
    },
    adminAuctions,
  );
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw Error('Porta de teste ausente.');
  const url = 'http://127.0.0.1:' + address.port;
  const clients = new Set<RealtimeClient>(),
    stopLifecycle = options.lifecycle === false ? async () => undefined : service.startLifecycle();
  return {
    configuration,
    connection,
    security,
    auth,
    service,
    server,
    realtime,
    url,
    async subject(buyers = 2) {
      const actors = await seedAuctionActors(connection, buyers);
      return {
        ...actors,
        buyerTokens: await Promise.all(actors.buyers.map((u) => authToken(security, u.id))),
        sellerToken: await authToken(security, actors.seller.id),
      };
    },
    client(
      token: string,
      settings: {
        transports?: ('websocket' | 'polling')[];
        origin?: string;
        query?: Record<string, string>;
        extraAuth?: object;
      } = {},
    ) {
      const socket: RealtimeClient = io(url + '/auctions', {
        autoConnect: false,
        reconnection: false,
        forceNew: true,
        timeout: 5000,
        transports: settings.transports ?? ['websocket'],
        auth: { token, ...settings.extraAuth },
        ...(settings.origin ? { extraHeaders: { Origin: settings.origin } } : {}),
        ...(settings.query ? { query: settings.query } : {}),
      });
      clients.add(socket);
      return socket;
    },
    disconnectClients() {
      for (const socket of clients) socket.disconnect();
      clients.clear();
    },
    async stopNetwork() {
      await realtime.close();
      await stopLifecycle();
    },
    async close() {
      for (const socket of clients) socket.disconnect();
      clients.clear();
      await realtime.close();
      await stopLifecycle();
      try {
        await connection.dropDatabase();
      } finally {
        await database.close();
      }
    },
  };
}
export async function connectClient(socket: RealtimeClient) {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => finish(Error('Ligação de teste excedeu o prazo.')), 6000);
    function finish(error?: Error) {
      clearTimeout(timer);
      socket.off('connect', success);
      socket.off('connect_error', failure);
      if (error) reject(error);
      else resolve();
    }
    function success() {
      finish();
    }
    function failure(error: Error) {
      finish(error);
    }
    socket.once('connect', success);
    socket.once('connect_error', failure);
    socket.connect();
  });
}
export async function command<T = AuctionSnapshot>(
  socket: RealtimeClient,
  event: string,
  payload: unknown,
): Promise<Reply<T>> {
  const sender = socket as unknown as {
    timeout(ms: number): { emitWithAck(event: string, payload: unknown): Promise<Reply<T>> };
  };
  return sender.timeout(10000).emitWithAck(event, payload);
}
export function nextEvent<K extends keyof ServerEvents>(
  socket: RealtimeClient,
  event: K,
  predicate: (v: Parameters<ServerEvents[K]>[0]) => boolean = () => true,
) {
  return new Promise<Parameters<ServerEvents[K]>[0]>((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, listener as never);
      reject(Error('Evento de teste não recebido: ' + event));
    }, 10000);
    function listener(value: Parameters<ServerEvents[K]>[0]) {
      if (!predicate(value)) return;
      clearTimeout(timer);
      socket.off(event, listener as never);
      resolve(value);
    }
    socket.on(event, listener as never);
  });
}
