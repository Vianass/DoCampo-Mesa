import { createServer } from 'node:http';
import { createApp } from './app.js';
import type { ApiConfiguration } from './config/environment.js';
import { connectDatabase } from './database/connection.js';

interface DatabaseHandle {
  close: (force?: boolean) => Promise<unknown>;
}

interface RuntimeDependencies {
  connect: (configuration: ApiConfiguration) => Promise<DatabaseHandle>;
}

export async function startApi(
  configuration: ApiConfiguration,
  dependencies: RuntimeDependencies = { connect: connectDatabase },
) {
  // A porta HTTP só abre depois de a configuração e a ligação estarem válidas.
  const database = await dependencies.connect(configuration);
  const server = createServer(createApp());
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
