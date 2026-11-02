import { randomUUID } from 'node:crypto';
import { Types } from 'mongoose';
import request from 'supertest';
import { beforeAll, afterAll, it, expect } from 'vitest';
import { connectDatabase } from '../../src/database/connection.js';
import { parseEnvironment } from '../../src/config/environment.js';
import { createApp } from '../../src/app.js';
import { createAuthService } from '../../src/modules/auth/auth.service.js';
import { createOrdersService } from '../../src/modules/orders/orders.service.js';
import { createProducerOrdersService } from '../../src/modules/orders/producer-orders.service.js';
import { createOrderReceiptService } from '../../src/modules/orders/order-receipt.service.js';
import { authConfiguration, authToken } from '../support/auth-fixtures.js';
import { receiptScenario } from '../support/order-receipt-fixtures.js';
import { checkoutTestNow } from '../support/checkout-fixtures.js';
const config = authConfiguration();
let database: Awaited<ReturnType<typeof connectDatabase>>, app: ReturnType<typeof createApp>;
beforeAll(async () => {
  database = await connectDatabase(
    parseEnvironment({
      NODE_ENV: 'test',
      MONGODB_URI: 'mongodb://127.0.0.1:27019/?replicaSet=rs-dcm-test&directConnection=true',
      MONGODB_DB_NAME: 'docampo_test_academic_' + randomUUID().replaceAll('-', ''),
    }),
  );
  const auth = createAuthService(database.connection, config),
    orders = createOrdersService(database.connection, { now: () => checkoutTestNow });
  await auth.prepare();
  await orders.prepare();
  app = createApp({
    auth,
    orders,
    producerOrders: createProducerOrdersService(database.connection, config.secret),
    receipt: createOrderReceiptService(database.connection, config.secret),
    security: config,
  });
});
afterAll(async () => {
  if (database)
    try {
      await database.connection.dropDatabase();
    } finally {
      await database.close();
    }
});
async function subject(state: 'pendente' | 'pronta' = 'pendente') {
  const s = await receiptScenario(database.connection, config.secret, state);
  return {
    ...s,
    token: await authToken(config, s.buyer.id),
    producerToken: await authToken(config, s.producer.id),
  };
}
type Subject = Awaited<ReturnType<typeof subject>>;
const raw = (s: Subject) =>
  database.connection.db!.collection('orders').findOne({ _id: new Types.ObjectId(s.id) });
const write = (s: Subject, token: string, body: object, tag?: string) => {
  const r = request(app)
    .patch('/api/orders/' + s.id + '/estado')
    .set('Authorization', 'Bearer ' + token);
  if (tag) r.set('If-Match', tag);
  return r.send(body);
};
it('percurso HTTP real reutiliza preparação e receção; entregue é apenas tradução na fronteira', async () => {
  const s = await subject(),
    stock = await database.connection
      .db!.collection('products')
      .findOne({ _id: s.s.products[0]!._id });
  for (const estado of ['confirmada', 'em_preparacao', 'pronta']) {
    const d = await request(app)
      .get('/api/me/producer/orders/' + s.id)
      .set('Authorization', 'Bearer ' + s.producerToken)
      .expect(200);
    const r = await write(s, s.producerToken, { estado }, d.headers.etag).expect(200);
    expect(r.body).toMatchObject({ estado, estadoPersistido: estado });
  }
  const before = await raw(s),
    d = await request(app)
      .get('/api/orders/' + s.id)
      .set('Authorization', 'Bearer ' + s.token)
      .expect(200);
  const r = await write(
    s,
    s.token,
    { estado: 'entregue', confirmarRececao: true },
    d.headers.etag,
  ).expect(200);
  expect(r.body).toMatchObject({
    estado: 'entregue',
    estadoPersistido: 'concluida',
    origem: 'nova',
  });
  const recovered = await write(
    s,
    s.token,
    { estado: 'entregue', confirmarRececao: true },
    d.headers.etag,
  ).expect(200);
  expect(recovered.body.origem).toBe('recuperada');
  const after = await raw(s);
  expect(after!.estado).toBe('concluida');
  expect(after!.pagamento).toEqual(before!.pagamento);
  expect(after!.linhas).toEqual(before!.linhas);
  expect(after!.rececao.historico).toHaveLength(1);
  expect(
    after!.historicoEstado.filter((e: { para: string }) => e.para === 'concluida'),
  ).toHaveLength(1);
  expect(
    await database.connection.db!.collection('products').findOne({ _id: s.s.products[0]!._id }),
  ).toEqual(stock);
  expect(
    (
      await request(app)
        .get('/api/orders/' + s.id)
        .set('Authorization', 'Bearer ' + s.token)
        .expect(200)
    ).body.estado,
  ).toBe('concluida');
});
it('não contorna JWT, proprietário, papel atual, confirmação ou ETag', async () => {
  const s = await subject('pronta'),
    other = await subject(),
    d = await request(app)
      .get('/api/orders/' + s.id)
      .set('Authorization', 'Bearer ' + s.token);
  const body = { estado: 'entregue', confirmarRececao: true };
  await request(app)
    .patch('/api/orders/' + s.id + '/estado')
    .send(body)
    .expect(401);
  await write(s, s.producerToken, body, d.headers.etag).expect(403);
  await write(s, other.token, body, d.headers.etag).expect(404);
  await write(s, s.token, body).expect(428);
  await write(s, s.token, body, 'W/' + d.headers.etag).expect(400);
  await write(s, s.token, { estado: 'entregue' }, d.headers.etag).expect(400);
  const p = await s.producers.detail(s.producer, s.id);
  await write(s, s.producerToken, { estado: 'concluida' }, p.etag).expect(409);
  await write(s, s.token, { estado: 'pronta' }, d.headers.etag).expect(403);
  await database.connection
    .db!.collection('users')
    .updateOne({ _id: s.s.buyerId }, { $set: { ativo: false } });
  await write(s, s.token, body, d.headers.etag).expect(401);
  expect((await raw(s))!.estado).toBe('pronta');
});
it('não salta estados operacionais nem aceita campos de autoridade', async () => {
  const s = await subject(),
    d = await request(app)
      .get('/api/orders/' + s.id)
      .set('Authorization', 'Bearer ' + s.token);
  await write(s, s.token, { estado: 'entregue', confirmarRececao: true }, d.headers.etag).expect(
    409,
  );
  const p = await s.producers.detail(s.producer, s.id);
  await write(s, s.producerToken, { estado: 'pronta' }, p.etag).expect(409);
  await write(
    s,
    s.producerToken,
    { estado: 'confirmada', compradorId: s.buyer.id },
    d.headers.etag,
  ).expect(400);
  expect((await raw(s))!.estado).toBe('pendente');
});
