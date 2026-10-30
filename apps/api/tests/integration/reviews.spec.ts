import { randomUUID } from 'node:crypto';
import { Types } from 'mongoose';
import request from 'supertest';
import { beforeAll, afterAll, it, expect } from 'vitest';
import { connectDatabase } from '../../src/database/connection.js';
import { parseEnvironment } from '../../src/config/environment.js';
import { createApp } from '../../src/app.js';
import { createAuthService } from '../../src/modules/auth/auth.service.js';
import { createAdminService } from '../../src/modules/admin/admin.service.js';
import { createReviewsService } from '../../src/modules/reviews/reviews.service.js';
import { createOrdersService } from '../../src/modules/orders/orders.service.js';
import { createUserModel } from '../../src/modules/users/user.model.js';
import { authConfiguration, authToken } from '../support/auth-fixtures.js';
import { userInput } from '../support/identity-fixtures.js';
import { seedCheckoutScenario, checkoutTestNow } from '../support/checkout-fixtures.js';
import { historicalReviewOrder } from '../support/review-fixtures.js';
let database: Awaited<ReturnType<typeof connectDatabase>>,
  app: ReturnType<typeof createApp>,
  service: ReturnType<typeof createReviewsService>;
const config = authConfiguration(),
  c = () => database.connection;
beforeAll(async () => {
  database = await connectDatabase(
    parseEnvironment({
      NODE_ENV: 'test',
      MONGODB_URI: 'mongodb://127.0.0.1:27019/?replicaSet=rs-dcm-test&directConnection=true',
      MONGODB_DB_NAME: 'docampo_test_' + randomUUID().replaceAll('-', ''),
    }),
  );
  const auth = createAuthService(c(), config),
    admin = createAdminService(c(), config.secret),
    orders = createOrdersService(c(), { now: () => checkoutTestNow });
  service = createReviewsService(c(), config.secret);
  await auth.prepare();
  await admin.prepare();
  await orders.prepare();
  await service.prepare();
  app = createApp({
    auth,
    admin,
    orders,
    reviews: service,
    security: config,
    adminLimits: { ipLimit: 100000, accountLimit: 100000 },
  });
});
afterAll(async () => {
  if (database)
    try {
      await c().dropDatabase();
    } finally {
      await database.close();
    }
});
async function subject() {
  const s = await seedCheckoutScenario(c()),
    token = await authToken(config, s.buyerId.toHexString()),
    order = await historicalReviewOrder(c(), {
      buyer: s.buyerId,
      producer: s.producers[0]!.userId,
      product: s.products[0]!._id,
    });
  return {
    ...s,
    token,
    order,
    input: {
      encomendaId: order.id,
      alvoTipo: 'produto',
      produtoId: s.products[0]!._id.toHexString(),
      classificacao: 5,
      comentario: 'Experiência fictícia verificada.',
    },
  };
}
async function administrator() {
  const user = await createUserModel(c()).create(
    userInput({ emailNormalizado: randomUUID() + '@example.invalid', papeis: ['administrador'] }),
  );
  return { user, token: await authToken(config, user.id) };
}
const post = (token: string, body: object) =>
  request(app)
    .post('/api/reviews')
    .set('Authorization', 'Bearer ' + token)
    .send(body);
const get = (url: string, token?: string) => {
  const r = request(app).get('/api' + url);
  return token ? r.set('Authorization', 'Bearer ' + token) : r;
};
async function detail(token: string, id: string) {
  return get('/admin/reviews/' + id, token).expect(200);
}
const moderate = (token: string, id: string, etag: string, estado = 'oculta') =>
  request(app)
    .patch('/api/admin/reviews/' + id + '/moderation')
    .set('Authorization', 'Bearer ' + token)
    .set('If-Match', etag)
    .send({ estado, motivo: 'Decisão fictícia fundamentada.' });
it('uma compra real pendente não ganha elegibilidade por ter recibo e stock debitado', async () => {
  const s = await subject();
  const receipt = await request(app)
    .post('/api/orders')
    .set('Authorization', 'Bearer ' + s.token)
    .set('Idempotency-Key', s.chave)
    .send(s.pedido)
    .expect(201);
  const id = receipt.body.encomendas[0].orderId;
  await post(s.token, { ...s.input, encomendaId: id }).expect(409);
  const record = await c()
    .db!.collection('orders')
    .findOne({ _id: new Types.ObjectId(id) });
  expect(record!.estado).toBe('pendente');
});
it('cria a partir da compra histórica concluída, preserva encomenda e stock, determina produtor no servidor', async () => {
  const s = await subject(),
    before = await c().db!.collection('orders').findOne({ _id: s.order._id }),
    stock = await c().db!.collection('products').findOne({ _id: s.products[0]!._id });
  const r = await post(s.token, s.input).expect(201);
  expect(r.headers.location).toBe('/api/me/reviews/' + r.body.id);
  expect(r.body).toMatchObject({
    encomendaId: s.order.id,
    estado: 'publicada',
    classificacao: 5,
    compraVerificada: true,
  });
  expect(await c().db!.collection('orders').findOne({ _id: s.order._id })).toEqual(before);
  expect(await c().db!.collection('products').findOne({ _id: s.products[0]!._id })).toEqual(stock);
});
it.each(['pendente', 'confirmada', 'em_preparacao', 'pronta', 'cancelada'])(
  'recusa compra persistida %s',
  async (estado) => {
    const s = await subject();
    await c().db!.collection('orders').updateOne({ _id: s.order._id }, { $set: { estado } });
    await post(s.token, s.input).expect(409);
  },
);
it('não confia em IDs de outra compra, outro produto ou produtor indicado pelo cliente', async () => {
  const a = await subject(),
    b = await subject();
  await post(b.token, a.input).expect(404);
  await post(a.token, { ...a.input, produtoId: b.products[0]!._id.toHexString() }).expect(400);
  await post(a.token, { ...a.input, produtorId: b.producers[0]!.userId.toHexString() }).expect(400);
});
it('duas submissões concorrentes criam apenas uma avaliação; ocultação não liberta unicidade', async () => {
  const s = await subject(),
    r = await Promise.all([post(s.token, s.input), post(s.token, s.input)]);
  expect(r.map((x) => x.status).sort()).toEqual([201, 409]);
  expect(await c().db!.collection('reviews').countDocuments({ encomenda: s.order._id })).toBe(1);
  const a = await administrator(),
    id = r.find((x) => x.status === 201)!.body.id,
    d = await detail(a.token, id);
  await moderate(a.token, id, d.headers.etag!).expect(200);
  await post(s.token, s.input).expect(409);
});
it('produtor e produtos têm médias separadas, ocultos não entram, agregados não dependem da página', async () => {
  const s = await subject(),
    first = await post(s.token, s.input).expect(201);
  await post(s.token, {
    encomendaId: s.order.id,
    alvoTipo: 'produtor',
    classificacao: 2,
    comentario: 'Avaliação direta da origem.',
  }).expect(201);
  const p = '/products/' + s.products[0]!._id + '/reviews',
    producer = '/producers/' + s.producers[0]!._id + '/reviews';
  expect((await get(p)).body.resumo).toMatchObject({ media: 5, numeroAvaliacoes: 1 });
  expect((await get(producer)).body.resumo.media).toBe(2);
  expect((await get(producer + '?alvoTipo=produto')).body.resumo.media).toBe(5);
  const a = await administrator(),
    d = await detail(a.token, first.body.id);
  await moderate(a.token, first.body.id, d.headers.etag!).expect(200);
  expect((await get(p)).body).toMatchObject({ itens: [], total: 0, resumo: { media: null } });
  expect((await get(producer)).body.resumo.media).toBe(2);
});
it('lista pessoal e detalhe oculto preservam conteúdo original e não expõem comprador em público', async () => {
  const s = await subject(),
    r = await post(s.token, s.input).expect(201),
    a = await administrator(),
    d = await detail(a.token, r.body.id);
  const publicBody = (await get('/products/' + s.products[0]!._id + '/reviews')).body;
  for (const x of ['autor', 'encomendaId', 'produtorContaId', 'historico', 'email', 'passwordHash'])
    expect(JSON.stringify(publicBody)).not.toContain('"' + x + '"');
  expect(JSON.stringify(publicBody)).not.toContain(s.buyerId.toHexString());
  await moderate(a.token, r.body.id, d.headers.etag!).expect(200);
  expect((await get('/me/reviews/' + r.body.id, s.token)).body).toMatchObject({
    estado: 'oculta',
    comentario: s.input.comentario,
    classificacao: 5,
  });
  const other = await subject();
  await get('/me/reviews/' + r.body.id, other.token).expect(404);
});
it('duas decisões com o mesmo ETag têm um vencedor; restauro regista nova versão e preserva autoria/motivo', async () => {
  const s = await subject(),
    r = await post(s.token, s.input).expect(201),
    a = await administrator(),
    b = await administrator(),
    d = await detail(a.token, r.body.id);
  const results = await Promise.all([
    moderate(a.token, r.body.id, d.headers.etag!),
    moderate(b.token, r.body.id, d.headers.etag!),
  ]);
  expect(results.map((r) => r.status).sort()).toEqual([200, 412]);
  const now = await detail(a.token, r.body.id);
  await moderate(a.token, r.body.id, now.headers.etag!, 'publicada').expect(200);
  const history = (await get('/admin/reviews/' + r.body.id + '/history', a.token)).body;
  expect(history.total).toBe(2);
  expect(history.itens.map((e: { versao: number }) => e.versao)).toEqual([2, 1]);
  expect(history.itens[1].administradorId).toBe(results[0]!.status === 200 ? a.user.id : b.user.id);
  expect((await get('/products/' + s.products[0]!._id + '/reviews')).body.total).toBe(1);
});
it('exige motivo, ETag atual e estados válidos; nunca permite editar comentário/classificação ou apagar', async () => {
  const s = await subject(),
    r = await post(s.token, s.input).expect(201),
    a = await administrator();
  await request(app)
    .patch('/api/admin/reviews/' + r.body.id + '/moderation')
    .set('Authorization', 'Bearer ' + a.token)
    .send({ estado: 'oculta', motivo: 'Motivo' })
    .expect(428);
  const d = await detail(a.token, r.body.id);
  await moderate(a.token, r.body.id, 'W/' + d.headers.etag!).expect(400);
  await request(app)
    .patch('/api/admin/reviews/' + r.body.id + '/moderation')
    .set('Authorization', 'Bearer ' + a.token)
    .set('If-Match', d.headers.etag!)
    .send({ estado: 'oculta', motivo: 'Motivo', comentario: 'Outro' })
    .expect(400);
  await request(app)
    .delete('/api/reviews/' + r.body.id)
    .set('Authorization', 'Bearer ' + a.token)
    .expect(404);
});
it('visitante, JWT inválido, comprador e produtor não moderam; conta desativada bloqueia JWT emitido', async () => {
  const s = await subject(),
    r = await post(s.token, s.input).expect(201),
    a = await administrator();
  await get('/admin/reviews').expect(401);
  await get('/admin/reviews', 'invalido').expect(401);
  await get('/admin/reviews', s.token).expect(403);
  const seller = await authToken(config, s.producers[0]!.userId.toHexString());
  await get('/admin/reviews', seller).expect(403);
  await post(seller, s.input).expect(403);
  await c()
    .db!.collection('users')
    .updateOne({ _id: a.user._id }, { $set: { ativo: false } });
  await get('/admin/reviews', a.token).expect(401);
  await c()
    .db!.collection('users')
    .updateOne({ _id: s.buyerId }, { $set: { ativo: false } });
  await get('/me/reviews', s.token).expect(401);
  await post(s.token, { ...s.input, alvoTipo: 'produtor' }).expect(401);
  expect(r.body.id).toBeTruthy();
});
it('filtros administrativos combinam IDs, alvo, estado e estrelas; páginas e queries são limitadas', async () => {
  const s = await subject(),
    r = await post(s.token, s.input).expect(201),
    a = await administrator();
  const q = `?identificador=${r.body.id}&produto=${s.products[0]!._id}&produtor=${s.producers[0]!._id}&estado=publicada&classificacao=5&alvoTipo=produto`;
  expect((await get('/admin/reviews' + q, a.token)).body.total).toBe(1);
  expect((await get('/admin/reviews' + q + '&pagina=999', a.token)).body.itens).toEqual([]);
  for (const query of [
    '?pagina=1001',
    '?porPagina=100',
    '?estado=pendente',
    '?classificacao=6',
    '?produto[$ne]=x',
  ])
    await get('/admin/reviews' + query, a.token).expect(400);
});
it('elegibilidade lista somente compras próprias e identifica avaliações existentes', async () => {
  const s = await subject(),
    other = await subject(),
    r = await post(s.token, s.input).expect(201),
    page = (await get('/me/review-eligibility', s.token)).body;
  expect(page.itens.every((x: { encomendaId: string }) => x.encomendaId !== other.order.id)).toBe(
    true,
  );
  expect(
    page.itens.find((x: { encomendaId: string }) => x.encomendaId === s.order.id),
  ).toMatchObject({
    elegivel: true,
    alvos: [{ avaliacaoId: r.body.id }, { alvoTipo: 'produtor', avaliacaoId: null }],
  });
});
it('paginação e média pública abrangem todas as avaliações publicadas do alvo', async () => {
  const s = await subject();
  let sum = 0;
  for (let i = 0; i < 13; i++) {
    const order =
      i === 0
        ? s.order
        : await historicalReviewOrder(c(), {
            buyer: s.buyerId,
            producer: s.producers[0]!.userId,
            product: s.products[0]!._id,
          });
    const rating = (i % 5) + 1;
    sum += rating;
    await post(s.token, { ...s.input, encomendaId: order.id, classificacao: rating }).expect(201);
  }
  const url = '/products/' + s.products[0]!._id + '/reviews',
    first = (await get(url)).body,
    last = (await get(url + '?pagina=2')).body;
  expect(first.itens).toHaveLength(12);
  expect(last.itens).toHaveLength(1);
  expect(first.total).toBe(13);
  expect(first.resumo.media).toBe(sum / 13);
  expect(last.resumo).toEqual(first.resumo);
  expect(new Set([...first.itens, ...last.itens].map((r) => r.id)).size).toBe(13);
});
it('leitura pública concorrente com ocultação mantém itens e agregados coerentes; novas consultas excluem o conteúdo', async () => {
  const s = await subject(),
    created = await post(s.token, s.input).expect(201),
    a = await administrator(),
    d = await detail(a.token, created.body.id),
    url = '/products/' + s.products[0]!._id + '/reviews';
  const results = await Promise.all([
    moderate(a.token, created.body.id, d.headers.etag!),
    get(url),
    get(url),
  ]);
  expect(results[0]!.status).toBe(200);
  for (const r of results.slice(1)) {
    expect(r.body.itens.length).toBe(r.body.total);
    expect(r.body.resumo.numeroAvaliacoes).toBe(r.body.total);
  }
  expect((await get(url)).body).toMatchObject({ itens: [], total: 0, resumo: { media: null } });
});
