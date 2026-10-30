import { createAdminAuctionsService } from '../../../api/src/modules/admin-auctions/admin-auctions.service.ts';
import { createReviewsService } from '../../../api/src/modules/reviews/reviews.service.ts';
import { reviewsReview } from './reviews-review.mjs';
import { createAdminOrdersService } from '../../../api/src/modules/admin-orders/admin-orders.service.ts';
import process from 'node:process';
import console from 'node:console';
import { randomBytes, randomUUID } from 'node:crypto';
import { createConnection } from 'mongoose';
import { createServer } from 'node:http';
import { createAuctionService } from '../../../api/src/modules/auctions/auction.service.ts';
import { attachAuctionSockets } from '../../../api/src/realtime/auction.socket.ts';
import { auctionReview } from './auction-review.mjs';
import { createApp } from '../../../api/src/app.ts';
import { parseAuthEnvironment } from '../../../api/src/config/auth-environment.ts';
import { createAuthService } from '../../../api/src/modules/auth/auth.service.ts';
import { createCatalogService } from '../../../api/src/modules/catalog/catalog.service.ts';
import { createOrdersService } from '../../../api/src/modules/orders/orders.service.ts';
import { createCheckoutPreparationService } from '../../../api/src/modules/orders/checkout-preparation.service.ts';
import { createProducerOrdersService } from '../../../api/src/modules/orders/producer-orders.service.ts';
import { createProducerApplicationService } from '../../../api/src/modules/producer-applications/producer-application.service.ts';
import { createProducerModel } from '../../../api/src/modules/producers/producer.model.ts';
import { seedCatalog } from '../../../api/src/development/catalog-seed.ts';
import { products, producers } from '../../src/data/market.ts';
import { producerReview } from './producer-review.mjs';
import { createAdminService } from '../../../api/src/modules/admin/admin.service.ts';
import { adminApplicationReview } from './admin-application-review.mjs';
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
let auctionReviewData;
let adminApplicationReviewData;
let reviewsReviewData;
let realtime;
let stopAuctions;
const reviewAuctions = process.env.DOCAMPO_AUCTION_REVIEW === '1';
const checkoutReview = process.env.DOCAMPO_CHECKOUT_REVIEW === '1';
const reviewProducer = process.env.DOCAMPO_PRODUCER_REVIEW === '1';
const reviewApplication = process.env.DOCAMPO_APPLICATION_REVIEW === '1';
const reviewAdminApplications = process.env.DOCAMPO_ADMIN_APPLICATION_REVIEW === '1';
const reviewReviews = process.env.DOCAMPO_REVIEWS_REVIEW === '1';
function stop() {
  return (stopping ??= (async () => {
    await realtime?.close();
    await stopAuctions?.();
    if (server?.listening)
      await new Promise((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())));
    try {
      await connection.dropDatabase();
    } finally {
      await producerReviewData?.cleanup();
      await auctionReviewData?.cleanup();
      await adminApplicationReviewData?.cleanup();
      await reviewsReviewData?.cleanup();
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
    JWT_TTL_SECONDS:
      checkoutReview ||
      reviewProducer ||
      reviewAuctions ||
      reviewApplication ||
      reviewAdminApplications ||
      reviewReviews
        ? '900'
        : '60',
    JWT_SECRET: randomBytes(48).toString('base64url'),
    CORS_ORIGINS: 'http://127.0.0.1:5183',
  });
  const auth = createAuthService(connection, authConfig),
    catalog = createCatalogService(connection, authConfig.secret);
  await auth.prepare();
  await catalog.prepare();
  const auctions = createAuctionService(connection, authConfig.secret);
  await auctions.prepare();
  const orders = createOrdersService(connection);
  const preparation = createCheckoutPreparationService(connection);
  const producerOrders = createProducerOrdersService(connection, authConfig.secret);
  await orders.prepare();
  await preparation.prepare();
  const adminAuctions = createAdminAuctionsService(connection, authConfig.secret);
  const reviews = createReviewsService(connection, authConfig.secret);
  await reviews.prepare();
  if (reviewReviews) {
    reviewsReviewData = await reviewsReview(connection, reviews);
    console.log(
      'Revisão de avaliações — contas históricas fictícias em ficheiro privado: ' +
        reviewsReviewData.file,
    );
  }
  const admin = createAdminService(connection, authConfig.secret);
  await admin.prepare();
  const producerApplications = createProducerApplicationService(connection, authConfig.secret);
  await producerApplications.prepare();
  if (reviewAdminApplications) {
    adminApplicationReviewData = await adminApplicationReview(connection, producerApplications);
    console.log(
      'Revisão administrativa — contas fictícias em ficheiro privado temporário: ' +
        adminApplicationReviewData.file,
    );
  }
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
  if (reviewAuctions) {
    auctionReviewData = await auctionReview(connection, auctions);
    console.log('Revisão de leilões — ficheiro privado temporário: ' + auctionReviewData.file);
  }
  server = createServer(
    createApp({
      auth,
      catalog,
      orders,
      preparation,
      producerOrders,
      auctions,
      producerApplications,
      admin,
      adminAuctions,
      reviews,
      adminOrders: createAdminOrdersService(connection),
      adminLimits: { ipLimit: 100000, accountLimit: 100000 },
      security: authConfig,
      rateLimit: { ipLimit: 1000, accountLimit: 1000 },
    }),
  );
  realtime = attachAuctionSockets(
    server,
    auctions,
    auth,
    authConfig,
    {
      enabled: true,
      syncIntervalMs: 100,
      authIntervalMs: 1000,
    },
    {},
    adminAuctions,
  );
  stopAuctions = auctions.startLifecycle();
  server.listen(3011, '127.0.0.1', () =>
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
