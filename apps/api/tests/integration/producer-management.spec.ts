import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { Types } from 'mongoose';
import request from 'supertest';
import { beforeAll, afterAll, it, expect } from 'vitest';
import { connectDatabase } from '../../src/database/connection.js';
import { parseEnvironment } from '../../src/config/environment.js';
import { createApp } from '../../src/app.js';
import { createAuthService } from '../../src/modules/auth/auth.service.js';
import { createCatalogService } from '../../src/modules/catalog/catalog.service.js';
import { createProducerManagementService } from '../../src/modules/producers/producer-management.service.js';
import { createImageService } from '../../src/modules/images/image.service.js';
import { developmentImageStorage } from '../../src/modules/images/image.storage.js';
import { createProducerModel } from '../../src/modules/producers/producer.model.js';
import { createUserModel } from '../../src/modules/users/user.model.js';
import { createAuctionService } from '../../src/modules/auctions/auction.service.js';
import { authConfiguration, authToken } from '../support/auth-fixtures.js';
import {
  catalogActor,
  publishedCatalogProduct,
  productHttpInput,
} from '../support/catalog-fixtures.js';
import { seedAuctionActors } from '../support/auction-fixtures.js';
import { createOrdersService } from '../../src/modules/orders/orders.service.js';
import { checkoutTestNow } from '../support/checkout-fixtures.js';
import { createOrderModel } from '../../src/modules/orders/order.model.js';
const config = authConfiguration();
let db: Awaited<ReturnType<typeof connectDatabase>>,
  app: ReturnType<typeof createApp>,
  directory: string,
  auctions: ReturnType<typeof createAuctionService>;
let image: Buffer;
const c = () => db.connection;
beforeAll(async () => {
  db = await connectDatabase(
    parseEnvironment({
      NODE_ENV: 'test',
      MONGODB_URI: 'mongodb://127.0.0.1:27019/?replicaSet=rs-dcm-test&directConnection=true',
      MONGODB_DB_NAME: 'docampo_test_management_' + randomUUID().replaceAll('-', ''),
    }),
  );
  const auth = createAuthService(c(), config),
    catalog = createCatalogService(c(), config.secret),
    profiles = createProducerManagementService(c(), config.secret);
  await auth.prepare();
  await catalog.prepare();
  directory = await mkdtemp(join(tmpdir(), 'docampo-management-test-'));
  const images = createImageService(
    c(),
    catalog,
    profiles,
    developmentImageStorage(directory, 'http://127.0.0.1:3011/api/media'),
  );
  app = createApp({ auth, catalog, producerManagement: profiles, images, security: config });
  auctions = createAuctionService(c(), config.secret);
  await auctions.prepare();
  image = await sharp({ create: { width: 60, height: 40, channels: 3, background: '#193c34' } })
    .png()
    .toBuffer();
});
afterAll(async () => {
  if (db)
    try {
      await c().dropDatabase();
    } finally {
      await db.close();
    }
  if (directory) await rm(directory, { recursive: true, force: true });
});
async function subject() {
  const actor = await catalogActor(c()),
    product = await publishedCatalogProduct(c(), actor),
    token = await authToken(config, actor.user.id);
  return { actor, product, token, id: product.id };
}
const get = (path: string, token: string) =>
  request(app)
    .get(path)
    .set('Authorization', 'Bearer ' + token);
function profileBody(p: Record<string, unknown>) {
  return Object.fromEntries(
    ['nomePublico', 'localidade', 'concelho', 'descricao', 'telefone', 'comercial', 'imagem']
      .filter((k) => p[k] !== undefined)
      .map((k) => [k, p[k]]),
  );
}
it('perfil GET/PUT real atualiza o público e preserva decisão, histórico e dados privados', async () => {
  const s = await subject(),
    before = await createProducerModel(c()).collection.findOne({ userId: s.actor.user._id }),
    original = await get('/api/me/producer', s.token).expect(200);
  expect(original.body.telefone).toBeDefined();
  const r = await request(app)
    .put('/api/me/producer')
    .set('Authorization', 'Bearer ' + s.token)
    .set('If-Match', original.headers.etag!)
    .send({ ...profileBody(original.body), nomePublico: 'Nome público atualizado' })
    .expect(200);
  expect(r.headers.etag).not.toBe(original.headers.etag);
  const publicProfile = await request(app)
    .get('/api/producers/' + s.actor.producer.id)
    .expect(200);
  expect(publicProfile.body.nomePublico).toBe('Nome público atualizado');
  expect(publicProfile.body.telefone).toBeUndefined();
  expect(publicProfile.body.comercial.pagamentoPrivado).toBeUndefined();
  const after = await createProducerModel(c()).collection.findOne({ userId: s.actor.user._id });
  expect(after!.aprovacao).toEqual(before!.aprovacao);
  expect(after!.historicoCandidaturas).toEqual(before!.historicoCandidaturas);
});
it('perfil rejeita falta de sessão, campos administrativos, configuração inválida e ETag ausente', async () => {
  const s = await subject(),
    p = await get('/api/me/producer', s.token),
    body = profileBody(p.body);
  await request(app).get('/api/me/producer').expect(401);
  for (const extra of [
    { aprovacao: { estado: 'aprovado' } },
    { userId: new Types.ObjectId().toHexString() },
    { comercial: { modalidades: {} } },
  ])
    await request(app)
      .put('/api/me/producer')
      .set('Authorization', 'Bearer ' + s.token)
      .set('If-Match', p.headers.etag!)
      .send({ ...body, ...extra })
      .expect(400);
  await request(app)
    .put('/api/me/producer')
    .set('Authorization', 'Bearer ' + s.token)
    .send(body)
    .expect(428);
});
it('duas edições concorrentes do perfil não se sobrepõem', async () => {
  const s = await subject(),
    p = await get('/api/me/producer', s.token);
  const result = await Promise.all(
    ['A', 'B'].map((nomePublico) =>
      request(app)
        .put('/api/me/producer')
        .set('Authorization', 'Bearer ' + s.token)
        .set('If-Match', p.headers.etag!)
        .send({ ...profileBody(p.body), nomePublico }),
    ),
  );
  expect(result.map((r) => r.status).sort()).toEqual([200, 412]);
});
it('limiar persiste, filtra e calcula alertas a partir do stock livre, sem inventar valor no legado', async () => {
  const s = await subject(),
    p = await get('/api/me/products/' + s.id, s.token);
  expect(p.body.limiarStockBaixo).toBeUndefined();
  await request(app)
    .put('/api/products/' + s.id)
    .set('Authorization', 'Bearer ' + s.token)
    .set('If-Match', p.headers.etag!)
    .send({
      ...productHttpInput(),
      estadoPublicacao: 'publicado',
      stockDisponivel: 250,
      limiarStockBaixo: 500,
    })
    .expect(200);
  const list = await get('/api/me/products?stock=baixo', s.token).expect(200);
  expect(list.body.total).toBe(1);
  const indicators = await get('/api/me/producer/indicators', s.token).expect(200);
  expect(indicators.body).toMatchObject({ produtos: 1, stockBaixo: 1, semStock: 0 });
  const latest = await get('/api/me/products/' + s.id, s.token);
  await request(app)
    .put('/api/products/' + s.id)
    .set('Authorization', 'Bearer ' + s.token)
    .set('If-Match', latest.headers.etag!)
    .send({
      ...productHttpInput(),
      estadoPublicacao: 'publicado',
      stockDisponivel: 0,
      limiarStockBaixo: 500,
    })
    .expect(200);
  expect((await get('/api/me/producer/indicators', s.token)).body).toMatchObject({
    stockBaixo: 0,
    semStock: 1,
  });
  expect((await request(app).get('/api/products/' + s.id)).body.limiarStockBaixo).toBeUndefined();
});
it('fotografia tem bytes reais, proprietário, limite de duas, substituição e privacidade de rascunhos', async () => {
  const s = await subject(),
    other = await subject();
  const d = await request(app)
    .post('/api/products')
    .set('Authorization', 'Bearer ' + s.token)
    .send({ nome: 'Fotografia privada' })
    .expect(201);
  const upload = (token: string, tag: string, query = '') =>
    request(app)
      .post('/api/me/products/' + d.body.id + '/images' + query)
      .set('Authorization', 'Bearer ' + token)
      .set('If-Match', tag)
      .set('Content-Type', 'image/png')
      .send(image);
  await upload(other.token, d.headers.etag!).expect(403);
  const first = await upload(s.token, d.headers.etag!).expect(200),
    url = new URL(first.body.imagens[0].url).pathname;
  await request(app).get(url).expect(404);
  expect((await get(url, s.token).expect(200)).headers['content-type']).toContain('image/webp');
  await get(url, other.token).expect(404);
  const second = await upload(s.token, first.headers.etag!).expect(200);
  expect(second.body.imagens).toHaveLength(2);
  await upload(s.token, second.headers.etag!).expect(409);
  const replaced = await upload(s.token, second.headers.etag!, '?substituir=0').expect(200);
  expect(replaced.body.imagens[0].url).not.toBe(first.body.imagens[0].url);
  await get(url, s.token).expect(404);
});
it('fotografia de perfil atualiza metadados próprios e só publica com perfil aprovado', async () => {
  const s = await subject(),
    p = await get('/api/me/producer', s.token);
  const r = await request(app)
    .post('/api/me/producer/image')
    .set('Authorization', 'Bearer ' + s.token)
    .set('If-Match', p.headers.etag!)
    .set('Content-Type', 'image/png')
    .send(image)
    .expect(200);
  const path = new URL(r.body.imagem.url).pathname;
  await request(app).get(path).expect(200);
  await createUserModel(c()).collection.updateOne(
    { _id: s.actor.user._id },
    { $set: { ativo: false } },
  );
  await request(app).get(path).expect(404);
  await get('/api/me/producer', s.token).expect(401);
});
it('imagem inválida não altera produto e tamanho HTTP é limitado', async () => {
  const s = await subject(),
    p = await get('/api/me/products/' + s.id, s.token);
  const invalid = await request(app)
    .post('/api/me/products/' + s.id + '/images?substituir=0')
    .set('Authorization', 'Bearer ' + s.token)
    .set('If-Match', p.headers.etag!)
    .set('Content-Type', 'image/png')
    .send(Buffer.from('conteúdo inválido'))
    .expect(400);
  expect(JSON.stringify(invalid.body)).not.toContain('conteúdo inválido');
  expect((await get('/api/me/products/' + s.id, s.token)).headers.etag).toBe(p.headers.etag);
  await request(app)
    .post('/api/me/products/' + s.id + '/images')
    .set('Authorization', 'Bearer ' + s.token)
    .set('If-Match', p.headers.etag!)
    .set('Content-Type', 'image/png')
    .send(Buffer.alloc(5 * 1024 * 1024 + 1))
    .expect(413);
});
it('gestão de stock respeita reserva real, ETag, unidade e arquivo sem cancelar leilão', async () => {
  const s = await seedAuctionActors(c()),
    token = await authToken(config, s.seller.id),
    productId = s.body.produtoId;
  const before = await get('/api/me/products/' + productId, token);
  const lot = await auctions.create(s.seller, s.body, randomUUID());
  await request(app)
    .put('/api/products/' + productId)
    .set('Authorization', 'Bearer ' + token)
    .set('If-Match', before.headers.etag!)
    .send({ ...productHttpInput(), estadoPublicacao: 'publicado' })
    .expect(412);
  const p = await get('/api/me/products/' + productId, token);
  expect(p.body.reservasLeilao[0].quantidade).toBe(500);
  const body = {
    ...productHttpInput(),
    unidadeVenda: p.body.unidadeVenda,
    estadoPublicacao: 'publicado',
    stockDisponivel: 100,
    limiarStockBaixo: 200,
  };
  await request(app)
    .put('/api/products/' + productId)
    .set('Authorization', 'Bearer ' + token)
    .set('If-Match', p.headers.etag!)
    .send({ ...body, unidadeVenda: { ...p.body.unidadeVenda, incrementoCompra: 100 } })
    .expect(409);
  const r = await request(app)
    .put('/api/products/' + productId)
    .set('Authorization', 'Bearer ' + token)
    .set('If-Match', p.headers.etag!)
    .send(body)
    .expect(200);
  expect(r.body.stockDisponivel).toBe(100);
  await request(app)
    .delete('/api/products/' + productId)
    .set('Authorization', 'Bearer ' + token)
    .set('If-Match', r.headers.etag!)
    .expect(204);
  expect(
    (await c()
      .db!.collection('auctions')
      .findOne({ _id: new Types.ObjectId(lot.body.id) }))!.reserva.estado,
  ).toBe('reservada');
  await request(app)
    .get('/api/products/' + productId)
    .expect(404);
});
it('checkout real invalida edição antiga; novos preços/perfil não reescrevem snapshots', async () => {
  const s = await seedAuctionActors(c()),
    token = await authToken(config, s.seller.id),
    productId = s.body.produtoId;
  const before = await get('/api/me/products/' + productId, token),
    orders = createOrdersService(c(), { now: () => checkoutTestNow });
  await orders.prepare();
  const purchase = await orders.checkout(s.buyers[0]!, s.scenario.chave, s.scenario.pedido);
  expect(purchase.status).toBe(201);
  const snapshots = await createOrderModel(c())
    .collection.find({ comprador: new Types.ObjectId(s.buyers[0]!.id) })
    .toArray();
  await request(app)
    .put('/api/products/' + productId)
    .set('Authorization', 'Bearer ' + token)
    .set('If-Match', before.headers.etag!)
    .send({ ...productHttpInput(), estadoPublicacao: 'publicado' })
    .expect(412);
  const latest = await get('/api/me/products/' + productId, token);
  await request(app)
    .put('/api/products/' + productId)
    .set('Authorization', 'Bearer ' + token)
    .set('If-Match', latest.headers.etag!)
    .send({ ...productHttpInput(), precoCent: 999, estadoPublicacao: 'publicado' })
    .expect(200);
  expect(
    await createOrderModel(c())
      .collection.find({ comprador: new Types.ObjectId(s.buyers[0]!.id) })
      .toArray(),
  ).toEqual(snapshots);
});

it('copiar URL de uma fotografia privada para outro perfil não publica nem transfere a propriedade', async () => {
  const s = await subject(),
    other = await subject();
  const d = await request(app)
    .post('/api/products')
    .set('Authorization', 'Bearer ' + s.token)
    .send({ nome: 'Imagem privada imutável' })
    .expect(201);
  const photo = await request(app)
    .post('/api/me/products/' + d.body.id + '/images')
    .set('Authorization', 'Bearer ' + s.token)
    .set('If-Match', d.headers.etag!)
    .set('Content-Type', 'image/png')
    .send(image)
    .expect(200);
  const p = await get('/api/me/producer', other.token);
  await request(app)
    .put('/api/me/producer')
    .set('Authorization', 'Bearer ' + other.token)
    .set('If-Match', p.headers.etag!)
    .send({ ...profileBody(p.body), imagem: { url: photo.body.imagens[0].url } })
    .expect(200);
  const uri = new URL(photo.body.imagens[0].url).pathname;
  await request(app).get(uri).expect(404);
  await get(uri, other.token).expect(404);
  await get(uri, s.token).expect(200);
});
