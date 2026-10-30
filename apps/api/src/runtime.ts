import { createAdminAuctionsService } from './modules/admin-auctions/admin-auctions.service.js';
import { createAdminOrdersService } from './modules/admin-orders/admin-orders.service.js';
import { createServer } from 'node:http';
import { createApp } from './app.js';
import type { ApiConfiguration } from './config/environment.js';
import { connectDatabase } from './database/connection.js';
import type { Connection } from 'mongoose';
import type { AuthConfiguration } from './config/auth-environment.js';
import { createAuthService } from './modules/auth/auth.service.js';
import { createCatalogService } from './modules/catalog/catalog.service.js';
import { createOrdersService } from './modules/orders/orders.service.js';
import { createCheckoutPreparationService } from './modules/orders/checkout-preparation.service.js';
import { createProducerOrdersService } from './modules/orders/producer-orders.service.js';
import { createAuctionService } from './modules/auctions/auction.service.js';
import { createProducerApplicationService } from './modules/producer-applications/producer-application.service.js';
import { createAdminService } from './modules/admin/admin.service.js';
import { attachAuctionSockets } from './realtime/auction.socket.js';
import {
  parseRealtimeEnvironment,
  type RealtimeConfiguration,
} from './config/realtime-environment.js';

interface DatabaseHandle {
  connection?: Connection;
  close: (force?: boolean) => Promise<unknown>;
}

interface RuntimeDependencies {
  connect: (configuration: ApiConfiguration) => Promise<DatabaseHandle>;
}

export async function startApi(
  configuration: ApiConfiguration,
  dependencies: RuntimeDependencies = { connect: connectDatabase },
  authentication?: AuthConfiguration,
  realtime: RealtimeConfiguration = parseRealtimeEnvironment(),
) {
  // A porta HTTP só abre depois de a configuração e a ligação estarem válidas.
  const database = await dependencies.connect(configuration);
  if (authentication && !database.connection) {
    await database.close();
    throw new Error('Ligação de autenticação indisponível.');
  }
  const auth = authentication ? createAuthService(database.connection!, authentication) : undefined;
  const catalog = authentication
    ? createCatalogService(database.connection!, authentication.secret)
    : undefined;
  const orders = authentication ? createOrdersService(database.connection!) : undefined;
  const preparation = authentication
    ? createCheckoutPreparationService(database.connection!)
    : undefined;
  const producerOrders = authentication
    ? createProducerOrdersService(database.connection!, authentication.secret)
    : undefined;
  const auctions = authentication
    ? createAuctionService(database.connection!, authentication.secret)
    : undefined;
  const producerApplications = authentication
    ? createProducerApplicationService(database.connection!, authentication.secret)
    : undefined;
  const admin = authentication
    ? createAdminService(database.connection!, authentication.secret)
    : undefined;
  try {
    if (admin) await admin.prepare();
    if (auth) await auth.prepare();
    if (catalog) await catalog.prepare();
    if (orders) await orders.prepare();
    if (preparation) await preparation.prepare();
    if (producerApplications) await producerApplications.prepare();
    if (auctions) {
      await auctions.prepare();
      await auctions.recover();
    }
  } catch {
    await database.close();
    throw new Error('Não foi possível preparar a autenticação.');
  }
  const adminAuctions = authentication
    ? createAdminAuctionsService(database.connection!, authentication.secret)
    : undefined;
  const server = createServer(
    createApp(
      authentication
        ? {
            auth,
            catalog,
            orders,
            preparation,
            producerOrders,
            auctions,
            producerApplications,
            admin,
            adminAuctions,
            adminOrders: auth ? createAdminOrdersService(database.connection!) : undefined,
            security: authentication,
          }
        : undefined,
    ),
  );
  const sockets =
    auctions && auth && authentication && realtime.enabled
      ? attachAuctionSockets(server, auctions, auth, authentication, realtime, {}, adminAuctions)
      : undefined;
  try {
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(configuration.port, configuration.host, () => {
        server.off('error', reject);
        resolve();
      });
    });
  } catch {
    await sockets?.close();
    await database.close();
    throw new Error('Não foi possível iniciar o servidor HTTP.');
  }

  const stopAuctions = auctions?.startLifecycle();
  let shutdown: Promise<void> | undefined;
  return {
    server,
    close(): Promise<void> {
      if (shutdown) return shutdown;
      shutdown = (async () => {
        let timeout: NodeJS.Timeout | undefined;
        const work = (async () => {
          await sockets?.close();
          await stopAuctions?.();
          if (server.listening)
            await new Promise<void>((resolve, reject) => {
              server.close((error) => (error ? reject(error) : resolve()));
              server.closeIdleConnections();
            });
          await database.close();
        })();
        try {
          await Promise.race([
            work,
            new Promise<never>((_resolve, reject) => {
              timeout = setTimeout(() => {
                server.closeAllConnections();
                void database.close(true).catch(() => undefined);
                reject(new Error('O encerramento excedeu o tempo permitido.'));
              }, configuration.shutdownTimeoutMs);
            }),
          ]);
        } finally {
          clearTimeout(timeout);
        }
      })();
      return shutdown;
    },
  };
}
