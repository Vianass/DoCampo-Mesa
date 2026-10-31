import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { createImageService } from '../../src/modules/images/image.service.js';
import { developmentImageStorage } from '../../src/modules/images/image.storage.js';
import { afterAll, beforeAll, expect, it } from 'vitest';
import request from 'supertest';
import { connectDatabase } from '../../src/database/connection.js';
import { parseEnvironment } from '../../src/config/environment.js';
import {
  catalogActor,
  publishedCatalogProduct,
  productHttpInput,
} from '../support/catalog-fixtures.js';
import { createApp } from '../../src/app.js';
import { createAuthService } from '../../src/modules/auth/auth.service.js';
import { createCatalogService } from '../../src/modules/catalog/catalog.service.js';
import { createProducerManagementService } from '../../src/modules/producers/producer-management.service.js';
import { createProducerModel } from '../../src/modules/producers/producer.model.js';
import { createUserModel } from '../../src/modules/users/user.model.js';
import { createProductModel } from '../../src/modules/products/product.model.js';
import { authConfiguration, authToken } from '../support/auth-fixtures.js';
let db: Awaited<ReturnType<typeof connectDatabase>>, app: ReturnType<typeof createApp>;
const cfg = authConfiguration();
let directory: string;
beforeAll(async () => {
  db = await connectDatabase(
    parseEnvironment({
      NODE_ENV: 'test',
      MONGODB_URI: 'mongodb://127.0.0.1:27019/?replicaSet=rs-dcm-test&directConnection=true',
      MONGODB_DB_NAME: 'docampo_test_discovery_' + randomUUID().replaceAll('-', ''),
    }),
  );
  const auth = createAuthService(db.connection, cfg),
    catalog = createCatalogService(db.connection, cfg.secret),
    profiles = createProducerManagementService(db.connection, cfg.secret);
  await auth.prepare();
  await catalog.prepare();
  directory = await mkdtemp(join(tmpdir(), 'docampo-discovery-images-'));
  const images = createImageService(
    db.connection,
    catalog,
    profiles,
    developmentImageStorage(directory, 'http://127.0.0.1:3011/api/media'),
  );
  app = createApp({ auth, catalog, producerManagement: profiles, images, security: cfg });
});
afterAll(async () => {
  if (db)
    try {
      await db.connection.dropDatabase();
    } finally {
      await db.close();
    }
  if (directory) await rm(directory, { recursive: true, force: true });
});
async function subject() {
  const actor = await catalogActor(db.connection, 'aprovado', 'Origem ' + randomUUID(), 'Évora'),
    token = await authToken(cfg, actor.user.id);
  return { actor, token };
}
const get = (url: string, token: string) =>
  request(app)
    .get(url)
    .set('Authorization', 'Bearer ' + token);
function profileBody(p: Record<string, unknown>) {
  return Object.fromEntries(
    [
      'nomePublico',
      'localidade',
      'concelho',
      'descricao',
      'telefone',
      'comercial',
      'imagem',
      'localizacaoPublica',
    ]
      .filter((k) => p[k] !== undefined)
      .map((k) => [k, p[k]]),
  );
}
it.each(['acafrao', 'AÇAFRÃO', '  aÇaFrÃo    sal  ', 'abobora'])(
  'pesquisa persistida por ingrediente exclusivo: %s',
  async (pesquisa) => {
    const s = await subject();
    const product = await publishedCatalogProduct(db.connection, s.actor, {
      nome: 'Preparação especial',
      descricao: 'Uma receita da horta.',
      ingredientesAplicaveis: true,
      ingredientes: ['Açafrão', 'Sementes de abóbora', 'Sal'],
    });
    const r = await request(app)
      .get('/api/products')
      .query({ pesquisa, produtor: s.actor.producer.id })
      .expect(200);
    expect(r.body.total).toBe(1);
    expect(r.body.itens[0].id).toBe(product.id);
  },
);
it('ingredientes combinam todos os filtros, paginação, ordenação e regex literal', async () => {
  const s = await subject();
  for (let i = 0; i < 13; i++)
    await publishedCatalogProduct(db.connection, s.actor, {
      nome: 'Preparado ' + String(i).padStart(2, '0'),
      categoriaId: 'cat-007',
      precoCent: 100 + i,
      ingredientesAplicaveis: true,
      ingredientes: ['Açafrão', 'Sal'],
      epocaMeses: [10],
      modoProducao: 'Biológico',
    });
  const query = {
    pesquisa: ' ACaFRao   SAL ',
    produtor: s.actor.producer.id,
    categoria: 'cat-007',
    localidade: 'EVORA',
    epoca: 'Outono',
    modoProducao: 'BIOLOGICO',
    bio: 'true',
    ordem: 'preco-asc',
    porPagina: '12',
  };
  const first = await request(app).get('/api/products').query(query).expect(200);
  expect(first.body.total).toBe(13);
  expect(first.body.itens).toHaveLength(12);
  expect(first.body.itens[0].precoCent).toBe(100);
  const last = await request(app)
    .get('/api/products')
    .query({ ...query, pagina: '2' })
    .expect(200);
  expect(last.body.itens).toHaveLength(1);
  expect(last.body.itens[0].precoCent).toBe(112);
  expect(
    (
      await request(app)
        .get('/api/products')
        .query({ ...query, ordem: 'preco-desc' })
    ).body.itens[0].precoCent,
  ).toBe(112);
  expect(
    (
      await request(app)
        .get('/api/products')
        .query({ ...query, epoca: 'Inverno' })
    ).body.total,
  ).toBe(0);
  expect(
    (
      await request(app)
        .get('/api/products')
        .query({ ...query, pesquisa: '.*' })
    ).body.total,
  ).toBe(0);
  await request(app).get('/api/products?pesquisa[$ne]=x').expect(400);
});
it('produto antigo sem array de ingredientes continua consultável e não ganha ingredientes fictícios', async () => {
  const s = await subject(),
    p = await publishedCatalogProduct(db.connection, s.actor, {
      nome: 'Produto antigo sem ingredientes',
    });
  await createProductModel(db.connection).collection.updateOne(
    { _id: p._id },
    { $unset: { ingredientes: '' } },
  );
  const r = await request(app)
    .get('/api/products/' + p.id)
    .expect(200);
  expect(r.body.ingredientes).toEqual([]);
  expect(
    (
      await request(app)
        .get('/api/products')
        .query({ pesquisa: 'açafrão', produtor: s.actor.producer.id })
    ).body.total,
  ).toBe(0);
  expect(
    (await createProductModel(db.connection).collection.findOne({ _id: p._id }))!.ingredientes,
  ).toBeUndefined();
});
it('CRUD real altera/remove ingredientes na pesquisa e preserva propriedade, ETag e conta ativa', async () => {
  const s = await subject(),
    other = await subject();
  const created = await request(app)
    .post('/api/products')
    .set('Authorization', 'Bearer ' + s.token)
    .send({ nome: 'Receita nova' })
    .expect(201);
  const input = {
    ...productHttpInput({
      nome: 'Receita nova',
      ingredientesAplicaveis: true,
      ingredientes: ['Manjericão'],
    }),
    estadoPublicacao: 'publicado',
  };
  const edit = await request(app)
    .put('/api/products/' + created.body.id)
    .set('Authorization', 'Bearer ' + s.token)
    .set('If-Match', created.headers.etag!)
    .send(input)
    .expect(200);
  expect(
    (
      await request(app)
        .get('/api/products')
        .query({ pesquisa: 'manjericao', produtor: s.actor.producer.id })
    ).body.total,
  ).toBe(1);
  await request(app)
    .put('/api/products/' + created.body.id)
    .set('Authorization', 'Bearer ' + other.token)
    .set('If-Match', edit.headers.etag!)
    .send(input)
    .expect(403);
  await request(app)
    .put('/api/products/' + created.body.id)
    .set('Authorization', 'Bearer ' + s.token)
    .set('If-Match', created.headers.etag!)
    .send(input)
    .expect(412);
  await request(app)
    .put('/api/products/' + created.body.id)
    .set('Authorization', 'Bearer ' + s.token)
    .set('If-Match', edit.headers.etag!)
    .send({ ...input, ingredientesAplicaveis: false, ingredientes: [] })
    .expect(200);
  expect(
    (
      await request(app)
        .get('/api/products')
        .query({ pesquisa: 'manjericao', produtor: s.actor.producer.id })
    ).body.total,
  ).toBe(0);
  await createUserModel(db.connection).collection.updateOne(
    { _id: s.actor.user._id },
    { $set: { ativo: false } },
  );
  await get('/api/me/products', s.token).expect(401);
});
it('ponto autorizado persiste, é público e removível sem expor a morada privada', async () => {
  const s = await subject(),
    p = await get('/api/me/producer', s.token).expect(200);
  const original = await createProducerModel(db.connection).collection.findOne({
    userId: s.actor.user._id,
  });
  const location = {
    latitude: 41.69,
    longitude: -8.83,
    descricao: 'Ponto público fictício de ensaio',
    autorizada: true,
  };
  const saved = await request(app)
    .put('/api/me/producer')
    .set('Authorization', 'Bearer ' + s.token)
    .set('If-Match', p.headers.etag!)
    .send({ ...profileBody(p.body), localizacaoPublica: location })
    .expect(200);
  const publicProfile = await request(app)
    .get('/api/producers/' + s.actor.producer.id)
    .expect(200);
  expect(publicProfile.body.localizacaoPublica).toEqual({
    latitude: 41.69,
    longitude: -8.83,
    descricao: location.descricao,
  });
  expect(publicProfile.body.telefone).toBeUndefined();
  expect(publicProfile.body.comercial.localLevantamento).toBeUndefined();
  expect(publicProfile.body.comercial.pagamentoPrivado).toBeUndefined();
  expect(
    (await createProducerModel(db.connection).collection.findOne({ userId: s.actor.user._id }))!
      .aprovacao,
  ).toEqual(original!.aprovacao);
  await request(app)
    .put('/api/me/producer')
    .set('Authorization', 'Bearer ' + s.token)
    .set('If-Match', p.headers.etag!)
    .send({ ...profileBody(saved.body), localizacaoPublica: location })
    .expect(412);
  await request(app)
    .put('/api/me/producer')
    .set('Authorization', 'Bearer ' + s.token)
    .set('If-Match', saved.headers.etag!)
    .send({ ...profileBody(saved.body), localizacaoPublica: null })
    .expect(200);
  expect(
    (await request(app).get('/api/producers/' + s.actor.producer.id)).body.localizacaoPublica,
  ).toBeUndefined();
});
it('autorização do ponto é validada no servidor e dados antigos não são geocodificados', async () => {
  const s = await subject(),
    p = await get('/api/me/producer', s.token);
  expect(p.body.localizacaoPublica).toBeUndefined();
  for (const extra of [
    { latitude: 91, longitude: 0, descricao: 'Inválida', autorizada: true },
    { latitude: 0, longitude: 181, descricao: 'Inválida', autorizada: true },
    { latitude: '41', longitude: 0, descricao: 'Inválida', autorizada: true },
    { latitude: 41, longitude: -8, descricao: 'Privada', autorizada: false },
    { latitude: 41, longitude: -8, descricao: 'Não autorizada' },
    { latitude: 41, longitude: -8, descricao: 'Ponto', autorizada: true, morada: 'Privada' },
  ])
    await request(app)
      .put('/api/me/producer')
      .set('Authorization', 'Bearer ' + s.token)
      .set('If-Match', p.headers.etag!)
      .send({ ...profileBody(p.body), localizacaoPublica: extra })
      .expect(400);
  const absent = await request(app).get('/api/producers/' + s.actor.producer.id);
  expect(absent.body.localizacaoPublica).toBeUndefined();
  await createProducerModel(db.connection).collection.updateOne(
    { userId: s.actor.user._id },
    {
      $set: {
        localizacaoPublica: {
          latitude: 41,
          longitude: -8,
          descricao: 'Dado legado sem autorização',
          autorizada: false,
        },
      },
    },
  );
  expect(
    (await request(app).get('/api/producers/' + s.actor.producer.id)).body.localizacaoPublica,
  ).toBeUndefined();
  await createUserModel(db.connection).collection.updateOne(
    { _id: s.actor.user._id },
    { $set: { ativo: false } },
  );
  await get('/api/me/producer', s.token).expect(401);
  await request(app)
    .get('/api/producers/' + s.actor.producer.id)
    .expect(404);
});
it('schema MongoDB recusa publicação de coordenadas sem autorização', async () => {
  const s = await subject(),
    p = await createProducerModel(db.connection)
      .findById(s.actor.producer._id)
      .select(
        '+telefone +aprovacao.decisao.autor +historicoCandidaturas +comercial.pagamentoPrivado',
      )
      .orFail();
  p.set('localizacaoPublica', {
    latitude: 41,
    longitude: -8,
    descricao: 'Teste',
    autorizada: false,
  });
  await expect(p.save()).rejects.toThrow();
});

it('substituir a fotografia do perfil preserva o ponto público autorizado', async () => {
  const s = await subject(),
    p = await get('/api/me/producer', s.token);
  const location = {
    latitude: 41.69,
    longitude: -8.83,
    descricao: 'Ponto fictício de ensaio',
    autorizada: true,
  };
  const saved = await request(app)
    .put('/api/me/producer')
    .set('Authorization', 'Bearer ' + s.token)
    .set('If-Match', p.headers.etag!)
    .send({ ...profileBody(p.body), localizacaoPublica: location })
    .expect(200);
  const image = await sharp({
    create: { width: 60, height: 40, channels: 3, background: '#193c34' },
  })
    .png()
    .toBuffer();
  const uploaded = await request(app)
    .post('/api/me/producer/image')
    .set('Authorization', 'Bearer ' + s.token)
    .set('If-Match', saved.headers.etag!)
    .set('Content-Type', 'image/png')
    .send(image)
    .expect(200);
  expect(uploaded.body.localizacaoPublica).toEqual(location);
  const publicProfile = await request(app)
    .get('/api/producers/' + s.actor.producer.id)
    .expect(200);
  expect(publicProfile.body.localizacaoPublica).toEqual({
    latitude: location.latitude,
    longitude: location.longitude,
    descricao: location.descricao,
  });
});
