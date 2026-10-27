import process from 'node:process';
import console from 'node:console';
import { randomBytes, randomUUID } from 'node:crypto';
import { createConnection } from 'mongoose';
import { createApp } from '../../../api/src/app.ts';
import { parseAuthEnvironment } from '../../../api/src/config/auth-environment.ts';
import { createAuthService } from '../../../api/src/modules/auth/auth.service.ts';
import { createCatalogService } from '../../../api/src/modules/catalog/catalog.service.ts';
import { seedCatalog } from '../../../api/src/development/catalog-seed.ts';
import { products, producers } from '../../src/data/market.ts';
// Apenas MongoDB de teste em loopback; nenhuma .env, credencial ou base de desenvolvimento.
const connection = await createConnection(
  'mongodb://127.0.0.1:27019/?replicaSet=rs-dcm-test&directConnection=true',
  {
    dbName: 'docampo_test_web_' + randomUUID().replaceAll('-', ''),
    serverSelectionTimeoutMS: 5000,
  },
).asPromise();
let server;
let stopping;
function stop() {
  return (stopping ??= (async () => {
    server?.close();
    try {
      await connection.dropDatabase();
    } finally {
      await connection.close();
    }
    console.log('Base efémera desta execução removida.');
  })());
}
try {
  const hello = await connection.db.admin().command({ hello: 1 });
  if (hello.setName !== 'rs-dcm-test' || !hello.isWritablePrimary)
    throw Error('Replica set de teste necessário.');
  const authConfig = parseAuthEnvironment({
    NODE_ENV: 'test',
    JWT_SECRET: randomBytes(48).toString('base64url'),
    CORS_ORIGINS: 'http://127.0.0.1:5183',
  });
  const auth = createAuthService(connection, authConfig),
    catalog = createCatalogService(connection, authConfig.secret);
  await auth.prepare();
  await catalog.prepare();
  const result = await seedCatalog(connection, { products, producers }, 'http://127.0.0.1:5183');
  const second = await seedCatalog(connection, { products, producers }, 'http://127.0.0.1:5183');
  if (second.inserted !== 0) throw Error('Seed não idempotente.');
  server = createApp({ auth, catalog, security: authConfig }).listen(3011, '127.0.0.1', () =>
    console.log(
      'API real isolada pronta; MongoDB ' +
        hello.setName +
        '; ' +
        result.products +
        ' produtos; segunda seed sem inserções.',
    ),
  );
  for (const signal of ['SIGTERM', 'SIGINT'])
    process.once(signal, () => {
      void stop().then(() => process.exit());
    });
} catch {
  await stop();
  process.exitCode = 1;
  console.error('Não foi possível preparar a API real isolada.');
}
