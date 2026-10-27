import process from 'node:process';
import console from 'node:console';
import { createConnection } from 'mongoose';
import { products, producers } from '../apps/web/src/data/market.ts';
import { assertLocalSeed, seedCatalog } from '../apps/api/src/development/catalog-seed.ts';
const uri =
  process.env.SEED_MONGODB_URI ??
  'mongodb://127.0.0.1:27018/?replicaSet=rs-dcm-dev&directConnection=true';
const database = process.env.SEED_DB_NAME ?? 'docampo_dev_catalog';
let connection;
try {
  assertLocalSeed(process.env.NODE_ENV, uri, database);
  connection = await createConnection(uri, {
    dbName: database,
    serverSelectionTimeoutMS: 5000,
  }).asPromise();
  const hello = await connection.db.admin().command({ hello: 1 });
  if (hello.setName !== 'rs-dcm-dev' || !hello.isWritablePrimary)
    throw Error('Replica set local de desenvolvimento indisponível.');
  const result = await seedCatalog(
    connection,
    { products, producers },
    process.env.SEED_IMAGE_ORIGIN ?? 'http://127.0.0.1:5173',
  );
  console.log(JSON.stringify({ database, ...result }));
} catch {
  console.error(
    'Seed recusado ou interrompido. Verifica o ambiente development, a base dedicada e o MongoDB local. Nenhuma credencial é apresentada.',
  );
  process.exitCode = 1;
} finally {
  await connection?.close();
}
