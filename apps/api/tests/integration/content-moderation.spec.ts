import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { Types, mongo } from 'mongoose';
import request from 'supertest';
import { beforeAll, afterAll, afterEach, it, expect, vi } from 'vitest';
import { connectDatabase } from '../../src/database/connection.js';
import { parseEnvironment } from '../../src/config/environment.js';
import { createApp } from '../../src/app.js';
import { createAuthService } from '../../src/modules/auth/auth.service.js';
import { createAdminService } from '../../src/modules/admin/admin.service.js';
import { createModerationService } from '../../src/modules/moderation/moderation.service.js';
import { createReviewsService } from '../../src/modules/reviews/reviews.service.js';
import { createCatalogService } from '../../src/modules/catalog/catalog.service.js';
import { createOrdersService } from '../../src/modules/orders/orders.service.js';
import { createAuctionService } from '../../src/modules/auctions/auction.service.js';
import { createUserModel, type UserRole } from '../../src/modules/users/user.model.js';
import { createProductModel } from '../../src/modules/products/product.model.js';
import { authConfiguration, authToken } from '../support/auth-fixtures.js';
import { userInput } from '../support/identity-fixtures.js';
import { seedCheckoutScenario, checkoutTestNow } from '../support/checkout-fixtures.js';
import { historicalReviewOrder } from '../support/review-fixtures.js';
import { createImageService } from '../../src/modules/images/image.service.js';
import { developmentImageStorage } from '../../src/modules/images/image.storage.js';
import { createProducerManagementService } from '../../src/modules/producers/producer-management.service.js';
let directory: string;
let database: Awaited<ReturnType<typeof connectDatabase>>,
  app: ReturnType<typeof createApp>,
  auth: ReturnType<typeof createAuthService>,
  service: ReturnType<typeof createModerationService>,
  reviews: ReturnType<typeof createReviewsService>,
  catalog: ReturnType<typeof createCatalogService>,
  auctions: ReturnType<typeof createAuctionService>;
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
  auth = createAuthService(c(), config);
  const admin = createAdminService(c(), config.secret),
    orders = createOrdersService(c(), { now: () => checkoutTestNow });
  service = createModerationService(c(), config.secret);
  reviews = createReviewsService(c(), config.secret);
  catalog = createCatalogService(c(), config.secret);
  auctions = createAuctionService(c(), config.secret);
  await auth.prepare();
  await admin.prepare();
  await orders.prepare();
  await catalog.prepare();
  await reviews.prepare();
  await service.prepare();
  await auctions.prepare();
  directory = await mkdtemp(join(tmpdir(), 'docampo-moderation-media-test-'));
  const profiles = createProducerManagementService(c(), config.secret);
  const images = createImageService(
    c(),
    catalog,
    profiles,
    developmentImageStorage(directory, 'http://127.0.0.1:3011/api/media'),
  );
  app = createApp({
    auth,
    admin,
    moderation: service,
    reviews,
    catalog,
    orders,
    auctions,
    images,
    producerManagement: profiles,
    security: config,
    adminLimits: { ipLimit: 100000, accountLimit: 100000 },
  });
});
afterEach(() => vi.restoreAllMocks());
afterAll(async () => {
  if (database)
    try {
      await c().dropDatabase();
    } finally {
      await database.close();
    }
  if (directory) await rm(directory, { recursive: true, force: true });
});
async function actor(role: UserRole = 'administrador') {
  const u = await createUserModel(c()).create(
      userInput({ emailNormalizado: randomUUID() + '@example.invalid', papeis: [role] }),
    ),
    token = await authToken(config, u.id);
  return { id: u.id, token, principal: await auth.authenticate(token) };
}
async function subject() {
  const s = await seedCheckoutScenario(c()),
    token = await authToken(config, s.buyerId.toHexString());
  const principal = await auth.authenticate(token),
    admin = await actor();
  const order = await historicalReviewOrder(c(), {
    buyer: s.buyerId,
    producer: s.producers[0]!.userId,
    product: s.products[0]!._id,
  });
  const review = await reviews.create(principal, {
    encomendaId: order.id,
    alvoTipo: 'produto',
    produtoId: s.products[0]!._id.toHexString(),
    classificacao: 5,
    comentario: 'Experiência fictícia verificada.',
  });
  return {
    ...s,
    token,
    principal,
    admin,
    review,
    ids: {
      produto: s.products[0]!._id.toHexString(),
      produtor: s.producers[0]!._id.toHexString(),
      avaliacao: review.id,
    },
  };
}
function get(path: string, token?: string) {
  const r = request(app).get('/api' + path);
  return token ? r.set('Authorization', 'Bearer ' + token) : r;
}
const post = (token: string, body: object) =>
  request(app)
    .post('/api/content-reports')
    .set('Authorization', 'Bearer ' + token)
    .send(body);
async function content(s: Awaited<ReturnType<typeof subject>>, kind: 'produto' | 'produtor') {
  return get('/admin/content/' + kind + '/' + s.ids[kind], s.admin.token).expect(200);
}
function etag(r: { headers: { etag?: string } }) {
  const value = r.headers.etag;
  expect(value).toMatch(/^"[A-Za-z0-9_-]{43}"$/);
  return value!;
}
function hide(
  s: Awaited<ReturnType<typeof subject>>,
  kind: 'produto' | 'produtor',
  tag: string,
  state = 'oculta',
) {
  return request(app)
    .patch('/api/admin/content/' + kind + '/' + s.ids[kind] + '/moderation')
    .set('Authorization', 'Bearer ' + s.admin.token)
    .set('If-Match', tag)
    .send({ estado: state, motivo: 'Análise administrativa fictícia.' });
}
it('fotografias ocultas são privadas e a edição do produtor não limpa a moderação', async () => {
  const s = await subject(),
    seller = await authToken(config, s.producers[0]!.userId.toHexString());
  const own = await get('/me/products/' + s.ids.produto, seller).expect(200);
  const image = await sharp({
    create: { width: 40, height: 30, channels: 3, background: '#193c34' },
  })
    .png()
    .toBuffer();
  const uploaded = await request(app)
    .post('/api/me/products/' + s.ids.produto + '/images?substituir=0')
    .set('Authorization', 'Bearer ' + seller)
    .set('If-Match', etag(own))
    .set('Content-Type', 'image/png')
    .send(image)
    .expect(200);
  const path = new URL(uploaded.body.imagens[0].url).pathname.replace(/^\/api/, '');
  await get(path).expect(200);
  const d = await content(s, 'produto');
  await hide(s, 'produto', etag(d)).expect(200);
  await get(path).expect(404);
  await get(path, s.token).expect(404);
  await get(path, seller).expect(200);
  await get(path, s.admin.token).expect(200);
  const current = await get('/me/products/' + s.ids.produto, seller).expect(200);
  const body = Object.fromEntries(
    [
      'nome',
      'descricao',
      'categoriaId',
      'precoCent',
      'unidadeVenda',
      'stockDisponivel',
      'ingredientesAplicaveis',
      'ingredientes',
      'etiquetas',
      'epocaMeses',
      'modoProducao',
      'imagens',
    ]
      .filter((k) => current.body[k] !== undefined)
      .map((k) => [k, current.body[k]]),
  );
  await request(app)
    .put('/api/products/' + s.ids.produto)
    .set('Authorization', 'Bearer ' + seller)
    .set('If-Match', etag(current))
    .send({
      ...body,
      estadoPublicacao: current.body.estadoPublicacao,
      nome: 'Produto editado mas ainda oculto',
    })
    .expect(200);
  await get('/products/' + s.ids.produto).expect(404);
  const updated = await content(s, 'produto');
  expect(updated.body.estadoModeracao).toBe('oculta');
  await hide(s, 'produto', etag(updated), 'visivel').expect(200);
  await get(path).expect(200);
});
it('nega operações quando a autenticação não está configurada', async () => {
  const closed = createApp({ moderation: service });
  await request(closed).post('/api/content-reports').send({}).expect(401);
  await request(closed).get('/api/me/content-reports').expect(401);
});
it('exige ETag forte e motivos válidos sem escrever auditoria', async () => {
  const s = await subject();
  const path = '/api/admin/content/produto/' + s.ids.produto + '/moderation';
  for (const [tag, code] of [
    [undefined, 428],
    ['W/"weak"', 400],
    ['"invalid"', 400],
  ] as const) {
    const r = request(app)
      .patch(path)
      .set('Authorization', 'Bearer ' + s.admin.token);
    if (tag) r.set('If-Match', tag);
    await r.send({ estado: 'oculta', motivo: 'Rever.' }).expect(code);
  }
  const d = await content(s, 'produto');
  await request(app)
    .patch(path)
    .set('Authorization', 'Bearer ' + s.admin.token)
    .set('If-Match', etag(d))
    .send({ estado: 'oculta', motivo: ' ' })
    .expect(400);
  expect(
    (await c().db!.collection('products').findOne({ _id: s.products[0]!._id }))!.moderacao,
  ).toBeUndefined();
});
it('duas decisões da mesma denúncia persistem só uma decisão e preservam o conteúdo', async () => {
  const s = await subject(),
    second = await actor();
  const r = await post(s.token, {
    alvoTipo: 'produto',
    alvoId: s.ids.produto,
    motivo: 'Rever.',
  }).expect(201);
  const d = await get('/admin/content-reports/' + r.body.id, s.admin.token).expect(200);
  const decisions = await Promise.all(
    [s.admin.token, second.token].map((token) =>
      request(app)
        .patch('/api/admin/content-reports/' + r.body.id + '/decision')
        .set('Authorization', 'Bearer ' + token)
        .set('If-Match', etag(d))
        .send({ estado: 'rejeitada', motivo: 'Conteúdo analisado sem fundamento para ocultação.' }),
    ),
  );
  expect(decisions.map((v) => v.status).sort()).toEqual([200, 412]);
  const stored = await c()
    .db!.collection('content_reports')
    .findOne({ _id: new Types.ObjectId(r.body.id) });
  expect(stored!.historico).toHaveLength(1);
  expect(stored!.conteudoNaDecisao).toEqual({ disponivel: true, estado: 'visivel', versao: 0 });
  await get('/products/' + s.ids.produto).expect(200);
});
it('denúncia de avaliação reutiliza moderação existente e mantém o original privado', async () => {
  const s = await subject();
  const r = await post(s.token, {
    alvoTipo: 'avaliacao',
    alvoId: s.review.id,
    motivo: 'Analisar comentário.',
  }).expect(201);
  const d = await get('/admin/reviews/' + s.review.id, s.admin.token).expect(200);
  await request(app)
    .patch('/api/admin/reviews/' + s.review.id + '/moderation')
    .set('Authorization', 'Bearer ' + s.admin.token)
    .set('If-Match', etag(d))
    .send({ estado: 'oculta', motivo: 'Motivo administrativo restrito.' })
    .expect(200);
  const publicReviews = await get('/products/' + s.ids.produto + '/reviews').expect(200);
  expect(publicReviews.body.total).toBe(0);
  expect(publicReviews.body.resumo.media).toBeNull();
  const report = await get('/admin/content-reports/' + r.body.id, s.admin.token).expect(200);
  expect(report.body.evidencia.descricao).toBe(s.review.comentario);
  expect(report.body.conteudo.estadoModeracao).toBe('oculta');
  expect(
    (await get('/me/content-reports?alvoTipo=avaliacao&alvoId=' + s.review.id, s.token).expect(200))
      .text,
  ).not.toContain('Motivo administrativo restrito');
  await post((await actor('produtor')).token, {
    alvoTipo: 'avaliacao',
    alvoId: s.review.id,
    motivo: 'Rever.',
  }).expect(404);
});
it('ocultar produto retira a sua avaliação da média de produtos do produtor', async () => {
  const s = await subject();
  const path = '/producers/' + s.ids.produtor + '/reviews?alvoTipo=produto';
  expect((await get(path).expect(200)).body.total).toBe(1);
  const d = await content(s, 'produto');
  await hide(s, 'produto', etag(d)).expect(200);
  expect((await get(path).expect(200)).body.total).toBe(0);
});
it('conta administrativa desativada não lê nem escreve com JWT anterior', async () => {
  const s = await subject(),
    d = await content(s, 'produto');
  await c()
    .db!.collection('users')
    .updateOne({ _id: new Types.ObjectId(s.admin.id) }, { $set: { ativo: false } });
  await get('/admin/content?tipo=produto', s.admin.token).expect(401);
  await hide(s, 'produto', etag(d)).expect(401);
});
for (const role of ['comprador', 'produtor', 'administrador'] as const)
  for (const target of ['produto', 'produtor', 'avaliacao'] as const)
    it(role + ' ativo pode denunciar ' + target + ' sem alterar o conteúdo', async () => {
      const s = await subject(),
        user = await actor(role);
      const before = await c().db!.collection('products').findOne({ _id: s.products[0]!._id });
      const r = await post(user.token, {
        alvoTipo: target,
        alvoId: s.ids[target],
        motivo: 'Sinalização fictícia.',
      }).expect(201);
      expect(r.body).toMatchObject({
        estado: 'pendente',
        alvoTipo: target,
        motivo: 'Sinalização fictícia.',
      });
      expect(r.headers.location).toContain('/api/me/content-reports?');
      expect(r.body).not.toHaveProperty('autorId');
      expect(r.body).not.toHaveProperty('historico');
      expect(await c().db!.collection('products').findOne({ _id: s.products[0]!._id })).toEqual(
        before,
      );
      const item = await get('/admin/content-reports/' + r.body.id, s.admin.token).expect(200);
      expect(item.body.autorId).toBe(user.id);
      expect(item.body.evidencia.nome).toBeTruthy();
      expect(JSON.stringify(item.body)).not.toContain('passwordHash');
    });
it('duas denúncias simultâneas da mesma conta/conteúdo persistem exatamente uma', async () => {
  const s = await subject(),
    body = { alvoTipo: 'produto', alvoId: s.ids.produto, motivo: 'Rever esta descrição.' };
  const results = await Promise.all([post(s.token, body), post(s.token, body)]);
  expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
  expect(
    await c()
      .db!.collection('content_reports')
      .countDocuments({ autor: s.buyerId, alvoId: s.products[0]!._id }),
  ).toBe(1);
  const own = await get(
    '/me/content-reports?alvoTipo=produto&alvoId=' + s.ids.produto,
    s.token,
  ).expect(200);
  expect(own.body.denuncia.motivo).toBe(body.motivo);
});
it('não revela denúncias de outra conta nem aceita identidade enviada pelo cliente', async () => {
  const s = await subject(),
    other = await actor('comprador');
  await post(s.token, { alvoTipo: 'produto', alvoId: s.ids.produto, motivo: 'Rever.' }).expect(201);
  expect(
    (
      await get('/me/content-reports?alvoTipo=produto&alvoId=' + s.ids.produto, other.token).expect(
        200,
      )
    ).body.denuncia,
  ).toBeNull();
  await post(other.token, {
    alvoTipo: 'produto',
    alvoId: s.ids.produto,
    motivo: 'Rever.',
    autor: s.buyerId,
  }).expect(400);
  await get(
    '/me/content-reports?alvoTipo=produto&alvoId=' + s.ids.produto + '&autor=' + s.buyerId,
    other.token,
  ).expect(400);
});
it('recusa visitante, JWT adulterado e conta desativada também com identidade antiga', async () => {
  const s = await subject(),
    body = { alvoTipo: 'produto', alvoId: s.ids.produto, motivo: 'Rever.' };
  await request(app).post('/api/content-reports').send(body).expect(401);
  await post('invalid-test-token', body).expect(401);
  await c()
    .db!.collection('users')
    .updateOne({ _id: s.buyerId }, { $set: { ativo: false } });
  await post(s.token, body).expect(401);
  await expect(
    service.create(s.principal, body as Parameters<typeof service.create>[1]),
  ).rejects.toMatchObject({ status: 401 });
});
it('recusa motivos, IDs, alvos inexistentes ou conteúdos que não estão públicos', async () => {
  const s = await subject();
  for (const body of [
    { alvoTipo: 'produto', alvoId: 'invalid', motivo: 'Rever.' },
    { alvoTipo: 'produto', alvoId: s.ids.produto, motivo: ' ' },
    { alvoTipo: 'produto', alvoId: s.ids.produto, motivo: 'x'.repeat(1001) },
    { alvoTipo: 'orders', alvoId: s.ids.produto, motivo: 'Rever.' },
  ])
    await post(s.token, body).expect(400);
  await post(s.token, {
    alvoTipo: 'produto',
    alvoId: new Types.ObjectId().toHexString(),
    motivo: 'Rever.',
  }).expect(404);
  await c()
    .db!.collection('products')
    .updateOne({ _id: s.products[0]!._id }, { $set: { estadoPublicacao: 'rascunho' } });
  await post(s.token, { alvoTipo: 'produto', alvoId: s.ids.produto, motivo: 'Rever.' }).expect(404);
});
it('limita abuso por conta sem criar denúncias nem aumentar limites de produção', async () => {
  const user = await actor('comprador');
  const statuses = [];
  for (let i = 0; i < 13; i++)
    statuses.push(
      (
        await post(user.token, {
          alvoTipo: 'produto',
          alvoId: new Types.ObjectId().toHexString(),
          motivo: 'Rever.',
        })
      ).status,
    );
  expect(statuses.slice(0, 12)).toEqual(Array(12).fill(404));
  expect(statuses[12]).toBe(429);
  expect(
    await c()
      .db!.collection('content_reports')
      .countDocuments({ autor: new Types.ObjectId(user.id) }),
  ).toBe(0);
});
it('todas as consultas e decisões administrativas exigem administrador atual', async () => {
  const s = await subject(),
    paths = [
      '/admin/content-reports',
      '/admin/content-reports/' + new Types.ObjectId(),
      '/admin/content?tipo=produto',
      '/admin/content/produto/' + s.ids.produto,
      '/admin/content/produto/' + s.ids.produto + '/history',
    ];
  for (const path of paths) {
    await get(path).expect(401);
    await get(path, s.token).expect(403);
  }
  await request(app)
    .patch('/api/admin/content/produto/' + s.ids.produto + '/moderation')
    .set('Authorization', 'Bearer ' + s.token)
    .send({ estado: 'oculta', motivo: 'Rever' })
    .expect(403);
  await c()
    .db!.collection('users')
    .updateOne({ _id: new Types.ObjectId(s.admin.id) }, { $set: { papeis: ['comprador'] } });
  await get(paths[0]!, s.admin.token).expect(403);
});
it('filtros e paginação MongoDB mantêm estados e tipos separados', async () => {
  const s = await subject();
  for (const tipo of ['produto', 'produtor', 'avaliacao'] as const)
    await post(s.token, { alvoTipo: tipo, alvoId: s.ids[tipo], motivo: 'Rever.' }).expect(201);
  const r = await get(
    '/admin/content-reports?estado=pendente&alvoTipo=avaliacao&pagina=1&porPagina=12&ordem=recentes',
    s.admin.token,
  ).expect(200);
  expect(r.body.itens.length).toBeGreaterThan(0);
  expect(
    r.body.itens.every(
      (v: { alvoTipo: string; estado: string }) =>
        v.alvoTipo === 'avaliacao' && v.estado === 'pendente',
    ),
  ).toBe(true);
  await get('/admin/content-reports?pagina=1001', s.admin.token).expect(400);
  await get(
    '/admin/content?tipo=produto&sinalizados=true&identificador=' + s.ids.produto,
    s.admin.token,
  )
    .expect(200)
    .then((v) => expect(v.body.total).toBe(1));
});
for (const tipo of ['produto', 'produtor'] as const)
  it(
    'oculta/restaura ' + tipo + ', protege ETag e mantém stock, publicação e aprovação',
    async () => {
      const s = await subject(),
        details = await content(s, tipo),
        original = await c()
          .db!.collection(tipo === 'produto' ? 'products' : 'producers')
          .findOne({ _id: new Types.ObjectId(s.ids[tipo]) });
      const path = tipo === 'produto' ? '/products/' : '/producers/';
      await get(path + s.ids[tipo]).expect(200);
      const hidden = await hide(s, tipo, etag(details)).expect(200);
      await get(path + s.ids[tipo]).expect(404);
      await get('/products/' + s.ids.produto).expect(404);
      await get('/products?produtor=' + s.ids.produtor)
        .expect(200)
        .then((v) => expect(v.body.total).toBe(0));
      await hide(s, tipo, etag(details), 'visivel').expect(412);
      const stored = await c()
        .db!.collection(tipo === 'produto' ? 'products' : 'producers')
        .findOne({ _id: original!._id });
      expect(stored!.stockDisponivel).toEqual(original!.stockDisponivel);
      expect(stored!.aprovacao).toEqual(original!.aprovacao);
      expect(stored!.estadoPublicacao).toEqual(original!.estadoPublicacao);
      expect(stored!.moderacao.historico).toHaveLength(1);
      await hide(s, tipo, etag(hidden), 'visivel').expect(200);
      await get(path + s.ids[tipo]).expect(200);
      expect(
        (
          await get(
            '/admin/content/' + tipo + '/' + s.ids[tipo] + '/history',
            s.admin.token,
          ).expect(200)
        ).body.total,
      ).toBe(2);
      expect(JSON.stringify((await get(path + s.ids[tipo]).expect(200)).body)).not.toContain(
        'Análise administrativa',
      );
    },
  );
it('duas decisões concorrentes partilham a mesma visibilidade e acrescentam uma única auditoria', async () => {
  const s = await subject(),
    other = await actor(),
    r = await content(s, 'produto');
  const responses = await Promise.all([
    hide(s, 'produto', etag(r)),
    request(app)
      .patch('/api/admin/content/produto/' + s.ids.produto + '/moderation')
      .set('Authorization', 'Bearer ' + other.token)
      .set('If-Match', etag(r))
      .send({ estado: 'oculta', motivo: 'Segunda análise.' }),
  ]);
  expect(responses.map((v) => v.status).sort()).toEqual([200, 412]);
  expect(
    (await c().db!.collection('products').findOne({ _id: s.products[0]!._id }))!.moderacao
      .historico,
  ).toHaveLength(1);
});
it('fechar denúncia exige ETag atual do conteúdo e guarda contexto sem moderar automaticamente', async () => {
  const s = await subject(),
    r = await post(s.token, {
      alvoTipo: 'produto',
      alvoId: s.ids.produto,
      motivo: 'Rever descrição.',
    }).expect(201);
  const d = await get('/admin/content-reports/' + r.body.id, s.admin.token).expect(200),
    p = await content(s, 'produto');
  await hide(s, 'produto', etag(p)).expect(200);
  const decide = (etag: string) =>
    request(app)
      .patch('/api/admin/content-reports/' + r.body.id + '/decision')
      .set('Authorization', 'Bearer ' + s.admin.token)
      .set('If-Match', etag)
      .send({ estado: 'resolvida', motivo: 'Conteúdo analisado e ocultado.' });
  await decide(etag(d)).expect(412);
  const fresh = await get('/admin/content-reports/' + r.body.id, s.admin.token).expect(200);
  const done = await decide(etag(fresh)).expect(200);
  expect(done.body.historico).toHaveLength(1);
  expect(done.body.conteudoNaDecisao).toMatchObject({
    disponivel: true,
    estado: 'oculta',
    versao: 1,
  });
  await decide(etag(fresh)).expect(412);
  expect(
    (await get('/me/content-reports?alvoTipo=produto&alvoId=' + s.ids.produto, s.token).expect(200))
      .body.denuncia.estado,
  ).toBe('resolvida');
});
it('restauro não publica um produto arquivado nem apaga a evidência denunciada', async () => {
  const s = await subject(),
    r = await post(s.token, {
      alvoTipo: 'produto',
      alvoId: s.ids.produto,
      motivo: 'Rever.',
    }).expect(201);
  const Product = createProductModel(c()),
    doc = await Product.findById(s.ids.produto).orFail();
  doc.estadoPublicacao = 'arquivado';
  await doc.save();
  const d = await content(s, 'produto'),
    h = await hide(s, 'produto', etag(d)).expect(200);
  await hide(s, 'produto', etag(h), 'visivel').expect(200);
  await get('/products/' + s.ids.produto).expect(404);
  expect(
    (await get('/admin/content-reports/' + r.body.id, s.admin.token).expect(200)).body.evidencia
      .nome,
  ).toBe(s.products[0]!.nome);
});
it('ocultação não apaga compras, snapshots ou recibos nem permite novas compras', async () => {
  const s = await subject();
  const receipt = await request(app)
    .post('/api/orders')
    .set('Authorization', 'Bearer ' + s.token)
    .set('Idempotency-Key', s.chave)
    .send(s.pedido)
    .expect(201);
  const id = receipt.body.encomendas[0].orderId,
    original = await c()
      .db!.collection('orders')
      .findOne({ _id: new Types.ObjectId(id) }),
    product = await content(s, 'produto');
  await hide(s, 'produto', etag(product)).expect(200);
  await request(app)
    .post('/api/orders')
    .set('Authorization', 'Bearer ' + s.token)
    .set('Idempotency-Key', s.chave)
    .send(s.pedido)
    .expect(200);
  await request(app)
    .post('/api/orders')
    .set('Authorization', 'Bearer ' + s.token)
    .set('Idempotency-Key', randomUUID())
    .send(s.pedido)
    .expect(409);
  expect(await c().db!.collection('orders').findOne({ _id: original!._id })).toEqual(original);
  expect(
    (await c().db!.collection('products').findOne({ _id: s.products[0]!._id }))!.stockDisponivel,
  ).toBe(9500);
});
it('perfil oculto bloqueia novas compras, mas preserva a identidade e a aprovação da conta', async () => {
  const s = await subject(),
    d = await content(s, 'produtor');
  await hide(s, 'produtor', etag(d)).expect(200);
  await request(app)
    .post('/api/orders')
    .set('Authorization', 'Bearer ' + s.token)
    .set('Idempotency-Key', s.chave)
    .send(s.pedido)
    .expect(409);
  expect(
    (await c().db!.collection('producers').findOne({ _id: s.producers[0]!._id }))!.aprovacao.estado,
  ).toBe('aprovado');
  expect(
    (await c().db!.collection('users').findOne({ _id: s.producers[0]!.userId }))!.ativo,
  ).not.toBe(false);
});
for (const hiddenKind of ['produto', 'produtor'] as const)
  it(
    hiddenKind +
      ': leilão existente sai da descoberta mas preserva preços, ofertas, reserva e textos privados',
    async () => {
      const s = await subject(),
        sellerToken = await authToken(config, s.producers[0]!.userId.toHexString()),
        seller = await auth.authenticate(sellerToken);
      const clock = await c()
        .db!.collection('users')
        .aggregate<{ now: Date }>([{ $match: { _id: s.buyerId } }, { $project: { now: '$$NOW' } }])
        .next();
      const input = {
        produtoId: s.ids.produto,
        quantidade: 500,
        titulo: 'Colheita fictícia original',
        descricao: 'Descrição original preservada no histórico privado.',
        precoBaseCent: 1200,
        incrementoCent: 100,
        terminaEm: new Date(clock!.now.getTime() + 600000).toISOString(),
      };
      const lot = await auctions.create(seller, input, randomUUID()),
        id = lot.body.id;
      const before = (await get('/auctions/' + id, s.token).expect(200)).body;
      const d = await content(s, hiddenKind);
      await hide(s, hiddenKind, etag(d)).expect(200);
      expect(
        (await get('/auctions', s.token).expect(200)).body.itens.some(
          (v: { id: string }) => v.id === id,
        ),
      ).toBe(false);
      const after = (await get('/auctions/' + id, s.token).expect(200)).body;
      expect(after.conteudoModerado).toBe(true);
      expect(after.titulo).not.toBe(before.titulo);
      for (const key of [
        'precoBaseCent',
        'incrementoCent',
        'iniciaEm',
        'terminaEm',
        'estado',
        'licitacaoAtual',
        'sequencia',
        'versao',
      ])
        expect(after[key]).toEqual(before[key]);
      expect((await get('/auctions/' + id, sellerToken).expect(200)).body.titulo).toBe(
        input.titulo,
      );
      await request(app)
        .post('/api/auctions/' + id + '/bids')
        .set('Authorization', 'Bearer ' + s.token)
        .set('Idempotency-Key', randomUUID())
        .send({ valorCent: 1300 })
        .expect(201);
      await request(app)
        .post('/api/auctions')
        .set('Authorization', 'Bearer ' + sellerToken)
        .set('Idempotency-Key', randomUUID())
        .send(input)
        .expect(hiddenKind === 'produtor' ? 403 : 409);
      expect(
        (await c().db!.collection('products').findOne({ _id: s.products[0]!._id }))!
          .stockDisponivel,
      ).toBe(9500);
      expect(
        (await c()
          .db!.collection('auctions')
          .findOne({ _id: new Types.ObjectId(id) }))!.titulo,
      ).toBe(input.titulo);
    },
  );
it('falha na decisão reverte a auditoria e a guarda administrativa na mesma transação', async () => {
  const s = await subject(),
    d = await content(s, 'produto'),
    before = await c().db!.collection('products').findOne({ _id: s.products[0]!._id }),
    adminBefore = await c()
      .db!.collection('users')
      .findOne({ _id: new Types.ObjectId(s.admin.id) });
  const original = mongo.Collection.prototype.findOneAndUpdate,
    failure = Error('Falha fictícia depois da escrita da decisão.');
  const spy = vi
    .spyOn(mongo.Collection.prototype, 'findOneAndUpdate')
    .mockImplementation(async function (this: mongo.Collection, ...args) {
      const result = await original.apply(this, args);
      if (this.collectionName === 'products' && String(args[0]._id) === s.ids.produto)
        throw failure;
      return result;
    });
  await expect(
    service.moderate(
      s.admin.principal,
      'produto',
      s.ids.produto,
      { estado: 'oculta', motivo: 'Rever.' },
      etag(d),
    ),
  ).rejects.toBe(failure);
  spy.mockRestore();
  expect(await c().db!.collection('products').findOne({ _id: s.products[0]!._id })).toEqual(before);
  expect(
    await c()
      .db!.collection('users')
      .findOne({ _id: new Types.ObjectId(s.admin.id) }),
  ).toEqual(adminBefore);
});
