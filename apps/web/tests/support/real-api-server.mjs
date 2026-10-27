import process from 'node:process';
import console from 'node:console';
import { randomBytes, randomUUID } from 'node:crypto';
import { createConnection } from 'mongoose';
import { createApp } from '../../../api/src/app.ts';
import { parseAuthEnvironment } from '../../../api/src/config/auth-environment.ts';
import { createAuthService } from '../../../api/src/modules/auth/auth.service.ts';
import { createCatalogService } from '../../../api/src/modules/catalog/catalog.service.ts';
import { createOrdersService } from '../../../api/src/modules/orders/orders.service.ts';
import { createCheckoutPreparationService } from '../../../api/src/modules/orders/checkout-preparation.service.ts';
import { createProducerOrdersService } from '../../../api/src/modules/orders/producer-orders.service.ts';
import { createProducerModel } from '../../../api/src/modules/producers/producer.model.ts';
import { seedCatalog } from '../../../api/src/development/catalog-seed.ts';
import { products, producers } from '../../src/data/market.ts';
import { producerReview } from './producer-review.mjs';
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
let producerReviewData;
const checkoutReview = process.env.DOCAMPO_CHECKOUT_REVIEW === '1';
const reviewProducer = process.env.DOCAMPO_PRODUCER_REVIEW === '1';
function stop() {
  return (stopping ??= (async () => {
    server?.close();
    try {
      await connection.dropDatabase();
    } finally {
      await producerReviewData?.cleanup();
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
    JWT_TTL_SECONDS: checkoutReview || reviewProducer ? '900' : '60',
    JWT_SECRET: randomBytes(48).toString('base64url'),
    CORS_ORIGINS: 'http://127.0.0.1:5183',
  });
  const auth = createAuthService(connection, authConfig),
    catalog = createCatalogService(connection, authConfig.secret);
  await auth.prepare();
  await catalog.prepare();
  const orders = createOrdersService(connection);
  const preparation = createCheckoutPreparationService(connection);
  const producerOrders = createProducerOrdersService(connection, authConfig.secret);
  await orders.prepare();
  await preparation.prepare();
  const result = await seedCatalog(connection, { products, producers }, 'http://127.0.0.1:5183');
  const second = await seedCatalog(connection, { products, producers }, 'http://127.0.0.1:5183');
  if (second.inserted !== 0) throw Error('Seed não idempotente.');
  if (checkoutReview) {
    // Apenas na base efémera desta execução. Não atualizar o catálogo de desenvolvimento.
    const Producer = createProducerModel(connection);
    const profiles = await Producer.find({}).select(
      '+telefone +aprovacao.decisao.autor +comercial.pagamentoPrivado',
    );
    for (const profile of profiles) {
      profile.set(
        'comercial.localLevantamento',
        'Ponto de levantamento fictício para revisão — ' + profile.nomePublico,
      );
      await profile.save();
    }
  }
  if (reviewProducer) {
    producerReviewData = await producerReview(connection, orders);
    console.log(
      'Contas fictícias de revisão (ficheiro privado temporário): ' + producerReviewData.file,
    );
  }
  server = createApp({
    auth,
    catalog,
    orders,
    preparation,
    producerOrders,
    security: authConfig,
    rateLimit: { ipLimit: 1000, accountLimit: 1000 },
  }).listen(3011, '127.0.0.1', () =>
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
