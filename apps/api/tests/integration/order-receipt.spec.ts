import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { Types } from 'mongoose';
import { io, type Socket } from 'socket.io-client';
import request from 'supertest';
import { beforeAll, afterAll, it, expect, vi } from 'vitest';
import { createOrderModel } from '../../src/modules/orders/order.model.js';
import { connectDatabase } from '../../src/database/connection.js';
import { parseEnvironment } from '../../src/config/environment.js';
import { createApp } from '../../src/app.js';
import { createAuthService } from '../../src/modules/auth/auth.service.js';
import { createOrdersService } from '../../src/modules/orders/orders.service.js';
import { createProducerOrdersService } from '../../src/modules/orders/producer-orders.service.js';
import { createOrderReceiptService } from '../../src/modules/orders/order-receipt.service.js';
import { createOrderNotificationsService } from '../../src/modules/orders/order-notifications.service.js';
import { createAuctionService } from '../../src/modules/auctions/auction.service.js';
import { createReviewsService } from '../../src/modules/reviews/reviews.service.js';
import { createAdminOrdersService } from '../../src/modules/admin-orders/admin-orders.service.js';
import { createAdminService } from '../../src/modules/admin/admin.service.js';
import { createUserModel } from '../../src/modules/users/user.model.js';
import type { OrderUpdate } from '../../src/realtime/order.protocol.js';
import { attachAuctionSockets } from '../../src/realtime/auction.socket.js';
import { authConfiguration, authToken } from '../support/auth-fixtures.js';
import { userInput } from '../support/identity-fixtures.js';
import { receiptScenario } from '../support/order-receipt-fixtures.js';
import { checkoutTestNow } from '../support/checkout-fixtures.js';
const config = authConfiguration();
let database: Awaited<ReturnType<typeof connectDatabase>>,
  app: ReturnType<typeof createApp>,
  network: ReturnType<typeof attachAuctionSockets>,
  url: string;
const c = () => database.connection,
  clients = new Set<Socket>();
beforeAll(async () => {
  database = await connectDatabase(
    parseEnvironment({
      NODE_ENV: 'test',
      MONGODB_URI: 'mongodb://127.0.0.1:27019/?replicaSet=rs-dcm-test&directConnection=true',
      MONGODB_DB_NAME: 'docampo_test_receipt_' + randomUUID().replaceAll('-', ''),
    }),
  );
  const auth = createAuthService(c(), config),
    orders = createOrdersService(c(), { now: () => checkoutTestNow }),
    receipt = createOrderReceiptService(c(), config.secret),
    auctions = createAuctionService(c(), config.secret),
    reviews = createReviewsService(c(), config.secret),
    admin = createAdminService(c(), config.secret);
  await auth.prepare();
  await orders.prepare();
  await auctions.prepare();
  await reviews.prepare();
  await admin.prepare();
  app = createApp({
    auth,
    orders,
    receipt,
    reviews,
    admin,
    producerOrders: createProducerOrdersService(c(), config.secret),
    adminOrders: createAdminOrdersService(c()),
    security: config,
    adminLimits: { ipLimit: 100000, accountLimit: 100000 },
  });
  const server = createServer(app);
  network = attachAuctionSockets(
    server,
    auctions,
    auth,
    config,
    { enabled: true, syncIntervalMs: 50, authIntervalMs: 50 },
    { connectionAttempts: 100000, eventsPerIp: 100000, eventsPerAccount: 100000 },
    undefined,
    createOrderNotificationsService(c()),
  );
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw Error('Porta ausente.');
  url = 'http://127.0.0.1:' + address.port;
});
afterAll(async () => {
  for (const socket of clients) socket.disconnect();
  await network?.close();
  if (database)
    try {
      await c().dropDatabase();
    } finally {
      await database.close();
    }
});
async function subject(
  state: 'pendente' | 'confirmada' | 'em_preparacao' | 'pronta' = 'pronta',
  delivery = false,
) {
  const s = await receiptScenario(c(), config.secret, state, delivery);
  return {
    ...s,
    token: await authToken(config, s.buyer.id),
    producerToken: await authToken(config, s.producer.id),
  };
}
type Subject = Awaited<ReturnType<typeof subject>>;
const read = (s: Subject) =>
  request(app)
    .get('/api/orders/' + s.id)
    .set('Authorization', 'Bearer ' + s.token);
const write = (s: Subject, tag?: string, token = s.token) => {
  const r = request(app)
    .patch('/api/orders/' + s.id + '/receipt')
    .set('Authorization', 'Bearer ' + token);
  if (tag !== undefined) r.set('If-Match', tag);
  return r.send({ confirmarRececao: true });
};
const raw = (s: Subject) =>
  c()
    .db!.collection('orders')
    .findOne({ _id: new Types.ObjectId(s.id) });
async function socket(token: string) {
  const client = io(url + '/orders', {
    forceNew: true,
    autoConnect: false,
    reconnection: false,
    transports: ['websocket'],
    auth: { token },
  });
  clients.add(client);
  await new Promise<void>((resolve, reject) => {
    client.once('connect', resolve);
    client.once('connect_error', reject);
    client.connect();
  });
  return client;
}
const watch = (s: Socket, body = {}) => s.timeout(5000).emitWithAck('orders:watch', body);
function event<T = OrderUpdate>(
  s: Socket,
  name: string,
  predicate: (v: T) => boolean = () => true,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      s.off(name, listener);
      reject(Error('Evento ausente ' + name));
    }, 5000);
    function listener(v: T) {
      if (!predicate(v)) return;
      clearTimeout(timer);
      s.off(name, listener);
      resolve(v);
    }
    s.on(name, listener);
  });
}
it.each([false, true])(
  'confirma compra real preparada; levantamento/entrega=%s; preserva stock/pagamento e gera elegibilidade',
  async (delivery) => {
    const s = await subject('pronta', delivery),
      before = await raw(s),
      stock = await c().db!.collection('products').findOne({ _id: s.s.products[0]!._id }),
      d = await read(s).expect(200);
    expect(d.body.podeConfirmarRececao).toBe(true);
    const r = await write(s, d.headers.etag!).expect(200),
      after = await raw(s);
    expect(r.body).toMatchObject({
      estado: 'concluida',
      origem: 'nova',
      podeConfirmarRececao: false,
      versao: 4,
    });
    expect(after!.pagamento).toEqual(before!.pagamento);
    expect(after!.linhas).toEqual(before!.linhas);
    expect(after!.idempotencia).toEqual(before!.idempotencia);
    expect(await c().db!.collection('products').findOne({ _id: s.s.products[0]!._id })).toEqual(
      stock,
    );
    expect(after!.rececao.confirmacaoRececaoEm).toBeInstanceOf(Date);
    expect(after!.historicoEstado.at(-1)).toMatchObject({
      de: 'pronta',
      para: 'concluida',
      ator: { userId: s.s.buyerId, papelNaAcao: 'comprador' },
    });
    expect(after!.rececao.historico.at(-1).comandoId).toBe(after!.historicoEstado.at(-1).comandoId);
    const eligible = await request(app)
      .get('/api/me/review-eligibility')
      .set('Authorization', 'Bearer ' + s.token)
      .expect(200);
    expect(
      eligible.body.itens.find((r: { encomendaId: string }) => r.encomendaId === s.id).elegivel,
    ).toBe(true);
    await request(app)
      .post('/api/reviews')
      .set('Authorization', 'Bearer ' + s.token)
      .send({
        encomendaId: s.id,
        alvoTipo: 'produto',
        produtoId: s.s.products[0]!._id.toHexString(),
        classificacao: 5,
        comentario: 'Compra real fictícia recebida.',
      })
      .expect(201);
  },
);
it.each(['pendente', 'confirmada', 'em_preparacao'] as const)(
  'recusa conclusão a partir de %s',
  async (state) => {
    const s = await subject(state),
      d = await read(s);
    await write(s, d.headers.etag).expect(409);
    expect((await raw(s))!.estado).toBe(state);
  },
);
it('recusa cancelada, sem reabrir nem criar histórico', async () => {
  const s = await subject('pendente');
  // Estado negativo persistido; não representa novo comando operacional de cancelamento.
  await c()
    .db!.collection('orders')
    .updateOne({ _id: new Types.ObjectId(s.id) }, { $set: { estado: 'cancelada' } });
  const d = await read(s);
  await write(s, d.headers.etag).expect(409);
  expect((await raw(s))!.estado).toBe('cancelada');
});
it('ETag e confirmação obrigatórios, sem campos de autoridade', async () => {
  const s = await subject(),
    d = await read(s);
  await write(s).expect(428);
  await write(s, 'W/' + d.headers.etag!).expect(400);
  for (const body of [
    {},
    { confirmarRececao: false },
    { confirmarRececao: true, estado: 'concluida' },
  ])
    await request(app)
      .patch('/api/orders/' + s.id + '/receipt')
      .set('Authorization', 'Bearer ' + s.token)
      .set('If-Match', d.headers.etag!)
      .send(body)
      .expect(400);
});
it('ETag anterior à preparação não conclui estado mais recente', async () => {
  const s = await subject('em_preparacao'),
    d = await read(s),
    p = await s.producers.detail(s.producer, s.id);
  await s.producers.status(s.producer, s.id, 'pronta', p.etag);
  await write(s, d.headers.etag).expect(412);
  expect((await raw(s))!.estado).toBe('pronta');
});
it('pedidos concorrentes e repetição após timeout deixam um único evento e devolvem recuperação', async () => {
  const s = await subject(),
    d = await read(s),
    results = await Promise.all([write(s, d.headers.etag), write(s, d.headers.etag)]);
  expect(results.map((r) => r.status)).toEqual([200, 200]);
  expect(results.map((r) => r.body.origem).sort()).toEqual(['nova', 'recuperada']);
  await write(s, d.headers.etag).expect(200);
  const r = await raw(s);
  expect(r!.versao).toBe(4);
  expect(r!.rececao.historico).toHaveLength(1);
  expect(r!.historicoEstado.filter((e: { para: string }) => e.para === 'concluida')).toHaveLength(
    1,
  );
});
it('JWT, proprietário e papéis são impostos no backend', async () => {
  const a = await subject(),
    b = await subject(),
    d = await read(a),
    admin = await createUserModel(c()).create(
      userInput({ emailNormalizado: randomUUID() + '@example.invalid', papeis: ['administrador'] }),
    );
  await write(a, d.headers.etag, 'invalido').expect(401);
  await request(app)
    .patch('/api/orders/' + a.id + '/receipt')
    .send({ confirmarRececao: true })
    .expect(401);
  await write(a, d.headers.etag, b.token).expect(404);
  await write(a, d.headers.etag, a.producerToken).expect(403);
  await write(a, d.headers.etag, await authToken(config, admin.id)).expect(403);
  await c()
    .db!.collection('users')
    .updateOne({ _id: a.s.buyerId }, { $set: { ativo: false } });
  await write(a, d.headers.etag).expect(401);
});
it('supervisão administrativa continua exclusivamente de leitura e mostra conclusão', async () => {
  const s = await subject(),
    d = await read(s);
  await write(s, d.headers.etag).expect(200);
  const admin = await createUserModel(c()).create(
      userInput({ emailNormalizado: randomUUID() + '@example.invalid', papeis: ['administrador'] }),
    ),
    token = await authToken(config, admin.id);
  const r = await request(app)
    .get('/api/admin/orders/' + s.id)
    .set('Authorization', 'Bearer ' + token)
    .expect(200);
  expect(r.body.estado).toBe('concluida');
  const list = await request(app)
    .get('/api/admin/orders?identificador=' + s.id + '&estado=concluida')
    .set('Authorization', 'Bearer ' + token)
    .expect(200);
  expect(list.body.total).toBe(1);
  expect(list.body.indicadores.porEstado.concluida).toBe(1);
  const history = await request(app)
    .get('/api/admin/orders/' + s.id + '/history?dominio=operacional')
    .set('Authorization', 'Bearer ' + token)
    .expect(200);
  expect(history.body.itens.some((e: { para?: string }) => e.para === 'concluida')).toBe(true);
  await request(app)
    .patch('/api/admin/orders/' + s.id + '/receipt')
    .set('Authorization', 'Bearer ' + token)
    .send({ confirmarRececao: true })
    .expect(404);
});
it('mesmo Socket.IO, subscrição privada, eventos mínimos para comprador e produtor; terceiros isolados', async () => {
  const s = await subject(),
    other = await subject(),
    a = await socket(s.token),
    p = await socket(s.producerToken),
    outsider = await socket(other.token),
    foreignProducer = await socket(other.producerToken);
  const foreign: unknown[] = [];
  outsider.on('order:updated', (v) => foreign.push(v));
  foreignProducer.on('order:updated', (v) => foreign.push(v));
  await watch(a);
  await watch(p);
  await watch(outsider);
  await watch(foreignProducer);
  const ae = event(a, 'order:updated', (v) => v.encomendaId === s.id),
    pe = event(p, 'order:updated', (v) => v.encomendaId === s.id),
    d = await read(s);
  await write(s, d.headers.etag).expect(200);
  const [av, pv] = await Promise.all([ae, pe]);
  expect(av).toEqual(pv);
  expect(Object.keys(av).sort()).toEqual(['atualizadaEm', 'encomendaId', 'estado', 'versao']);
  expect(av.estado).toBe('concluida');
  expect(foreign).toEqual([]);
  for (const client of [a, p, outsider, foreignProducer]) client.disconnect();
});
it('subscrição não aceita ID/room alheia e JWT inválido/admin sem capacidade não ligam', async () => {
  const s = await subject(),
    client = await socket(s.token);
  expect((await watch(client, { userId: 'outra-conta' })).ok).toBe(false);
  client.disconnect();
  await expect(socket('invalido')).rejects.toThrow();
  const admin = await createUserModel(c()).create(
    userInput({ emailNormalizado: randomUUID() + '@example.invalid', papeis: ['administrador'] }),
  );
  await expect(socket(await authToken(config, admin.id))).rejects.toThrow();
});
it('desativação com ligação aberta desliga antes de novas notificações', async () => {
  const s = await subject(),
    client = await socket(s.token);
  await watch(client);
  const disconnected = event(client, 'disconnect');
  await c()
    .db!.collection('users')
    .updateOne({ _id: s.s.buyerId }, { $set: { ativo: false } });
  await disconnected;
  expect(client.connected).toBe(false);
});
it('remoção de papel com ligação aberta retira a subscrição', async () => {
  const s = await subject(),
    client = await socket(s.token);
  await watch(client);
  const disconnected = event(client, 'disconnect');
  await c()
    .db!.collection('users')
    .updateOne({ _id: s.s.buyerId }, { $set: { papeis: ['administrador'] } });
  await disconnected;
});
it('reconexão obriga a subscrever e consultar REST; conclusão durante ausência é recuperada', async () => {
  const s = await subject(),
    client = await socket(s.token);
  await watch(client);
  client.disconnect();
  const d = await read(s);
  await write(s, d.headers.etag).expect(200);
  const connected = await socket(s.token);
  expect((await watch(connected)).data.consultar).toBe(true);
  expect((await read(s)).body.estado).toBe('concluida');
  connected.disconnect();
});
it('rollback real após save não conclui, não duplica auditoria e não publica estado especulativo', async () => {
  const s = await subject(),
    d = await read(s),
    before = await raw(s),
    client = await socket(s.token);
  await watch(client);
  const notifications: unknown[] = [];
  client.on('order:updated', (value) => notifications.push(value));
  const Order = createOrderModel(c()),
    original = Order.prototype.save;
  const spy = vi.spyOn(Order.prototype, 'save').mockImplementationOnce(async function (options) {
    await original.call(this, options);
    throw new Error('Falha fictícia antes do commit.');
  });
  try {
    await write(s, d.headers.etag).expect(500);
  } finally {
    spy.mockRestore();
  }
  expect(await raw(s)).toEqual(before);
  await new Promise((resolve) => setTimeout(resolve, 150));
  expect(notifications).toEqual([]);
  await write(s, d.headers.etag).expect(200);
  expect((await raw(s))!.rececao.historico).toHaveLength(1);
  client.disconnect();
});
it.each(['por_pagar', 'pagamento_comunicado', 'pago'] as const)(
  'conclusão preserva pagamento %s',
  async (estado) => {
    const s = await subject(),
      document = await createOrderModel(c()).findById(s.id).orFail();
    if (estado !== 'por_pagar') {
      document.set('pagamento.estado', estado);
      document.set('pagamento.historico', [
        ...document.pagamento.historico,
        {
          id: randomUUID(),
          comandoId: randomUUID(),
          tipo: 'pagamento_historico_ficticio',
          ator: {
            tipo: 'utilizador',
            userId: estado === 'pago' ? s.s.producers[0]!.userId : s.s.buyerId,
            papelNaAcao: estado === 'pago' ? 'produtor' : 'comprador',
          },
          ocorridoEm: new Date(),
          de: 'por_pagar',
          para: estado,
          versaoObservada: document.versao,
        },
      ]);
      await document.save();
    }
    const before = await raw(s),
      d = await read(s);
    await write(s, d.headers.etag).expect(200);
    expect((await raw(s))!.pagamento).toEqual(before!.pagamento);
  },
);
it('expiração do JWT impede REST e encerra uma ligação já aberta', async () => {
  const s = await subject(),
    expired = await authToken(config, s.buyer.id, { exp: Math.floor(Date.now() / 1000) - 1 }),
    d = await read(s);
  await write(s, d.headers.etag, expired).expect(401);
  await expect(socket(expired)).rejects.toThrow();
  const short = await socket(
    await authToken(config, s.buyer.id, { exp: Math.floor(Date.now() / 1000) + 2 }),
  );
  await watch(short);
  await event(short, 'disconnect');
  expect(short.connected).toBe(false);
});
