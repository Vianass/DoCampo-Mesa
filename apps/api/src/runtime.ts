import { createServer } from 'node:http';
import { createApp } from './app.js';
import type { ApiConfiguration } from './config/environment.js';
import { connectDatabase } from './database/connection.js';
import type { Connection } from 'mongoose';
import type { AuthConfiguration } from './config/auth-environment.js';
import { createAuthService } from './modules/auth/auth.service.js';
import { createCatalogService } from './modules/catalog/catalog.service.js';
import { createOrdersService } from './modules/orders/orders.service.js';

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
  try {
    if (auth) await auth.prepare();
    if (catalog) await catalog.prepare();
    if (orders) await orders.prepare();
  } catch {
    await database.close();
    throw new Error('Não foi possível preparar a autenticação.');
  }
  const server = createServer(
    createApp(
      authentication
        ? {
            auth,
            catalog,
            orders,
            security: authentication,
          }
        : undefined,
    ),
  );
  try {
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(configuration.port, configuration.host, () => {
        server.off('error', reject);
        resolve();
      });
    });
  } catch {
    await database.close();
    throw new Error('Não foi possível iniciar o servidor HTTP.');
  }

  let shutdown: Promise<void> | undefined;
  return {
    server,
    close(): Promise<void> {
      if (shutdown) return shutdown;
      shutdown = (async () => {
        let timeout: NodeJS.Timeout | undefined;
        const work = (async () => {
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
