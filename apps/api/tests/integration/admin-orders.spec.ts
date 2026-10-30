import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { Types } from 'mongoose';
import { beforeAll, beforeEach, afterAll, describe, it, expect } from 'vitest';
import { connectDatabase } from '../../src/database/connection.js';
import { parseEnvironment } from '../../src/config/environment.js';
import { createApp } from '../../src/app.js';
import { createAuthService } from '../../src/modules/auth/auth.service.js';
import { createAdminService } from '../../src/modules/admin/admin.service.js';
import { createAdminOrdersService } from '../../src/modules/admin-orders/admin-orders.service.js';
import { createUserModel, type UserRole } from '../../src/modules/users/user.model.js';
import { createOrderModel } from '../../src/modules/orders/order.model.js';
import {
  orderInput,
  orderFixtureBuyer,
  orderFixtureProducer,
  orderEvent,
} from '../support/order-fixtures.js';
import { userInput } from '../support/identity-fixtures.js';
import { authConfiguration, authToken } from '../support/auth-fixtures.js';
let database: Awaited<ReturnType<typeof connectDatabase>>, app: ReturnType<typeof createApp>;
const config = authConfiguration(),
  c = () => database.connection,
  base = '/api/admin/orders';
beforeAll(async () => {
  database = await connectDatabase(
    parseEnvironment({
      NODE_ENV: 'test',
      MONGODB_URI: 'mongodb://127.0.0.1:27019/?replicaSet=rs-dcm-test&directConnection=true',
      MONGODB_DB_NAME: 'docampo_test_' + randomUUID().replaceAll('-', ''),
    }),
  );
  const auth = createAuthService(c(), config),
    admin = createAdminService(c(), config.secret);
  await auth.prepare();
  await admin.prepare();
  await createOrderModel(c()).createCollection();
  await createOrderModel(c()).createIndexes();
  app = createApp({
    auth,
    admin,
    adminOrders: createAdminOrdersService(c()),
    security: config,
    adminLimits: { ipLimit: 100000, accountLimit: 100000 },
  });
});
beforeEach(async () => {
  for (const name of ['users', 'orders', 'products']) await c().db!.collection(name).deleteMany({});
});
afterAll(async () => {
  if (database)
    try {
      await c().dropDatabase();
    } finally {
      await database.close();
    }
});
async function actor(roles: UserRole[] = ['administrador']) {
  const u = await createUserModel(c()).create(
    userInput({ emailNormalizado: randomUUID() + '@example.invalid', papeis: roles }),
  );
  return { id: u._id, token: await authToken(config, u.id) };
}
const get = (p: string, a: { token: string }) =>
  request(app)
    .get(base + p)
    .set('Authorization', 'Bearer ' + a.token);
async function seed(n = 1) {
  for (const [id, nome] of [
    [orderFixtureBuyer, 'Comprador de teste'],
    [orderFixtureProducer, 'Produtor de teste'],
  ] as const)
    await createUserModel(c()).create(
      userInput({ _id: id, nome, emailNormalizado: id + '@example.invalid' }),
    );
  const records = Array.from({ length: n }, (_, i) =>
    orderInput(i % 2 ? 'pronta' : 'pendente', { createdAt: new Date('2026-10-22T09:00:00Z') }),
  );
  await c().db!.collection('orders').insertMany(records);
  return records as (Record<string, unknown> & { _id: Types.ObjectId })[];
}
describe('supervisão com MongoDB real', () => {
  it('página global e indicadores são coerentes, ordenação desempata por ID', async () => {
    const a = await actor();
    await seed(13);
    const first = (await get('?porPagina=12', a).expect(200)).body,
      second = (await get('?pagina=2', a).expect(200)).body;
    expect(first).toMatchObject({
      total: 13,
      totalPaginas: 2,
      indicadores: { numeroEncomendas: 13, porEstado: { pendente: 7, pronta: 6 } },
    });
    expect(first.itens).toHaveLength(12);
    expect(second.itens).toHaveLength(1);
    const ids = [...first.itens, ...second.itens].map((o: { id: string }) => o.id);
    expect(new Set(ids).size).toBe(13);
    expect(ids).toEqual([...ids].sort().reverse());
    const ancient = (await get('?ordem=antigas&porPagina=24', a)).body.itens.map(
      (o: { id: string }) => o.id,
    );
    expect(ancient).toEqual([...ids].reverse());
    expect((await get('?pagina=999', a)).body).toMatchObject({
      itens: [],
      total: 13,
      pagina: 999,
      totalPaginas: 2,
    });
  });
  it('filtros combinados usam contas de users e ID exato, não perfis ou nomes', async () => {
    const a = await actor(),
      [r] = await seed();
    const q =
      '?estado=pendente&pagamento=por_pagar&produtor=' +
      orderFixtureProducer +
      '&comprador=' +
      orderFixtureBuyer +
      '&identificador=' +
      r!._id;
    expect((await get(q, a)).body.total).toBe(1);
    for (const suffix of ['&estado=pronta']) await get(q + suffix, a).expect(400);
    expect((await get('?produtor=' + new Types.ObjectId(), a)).body.total).toBe(0);
    expect((await get('?identificador=' + r!._id + '&estado=pronta', a)).body.total).toBe(0);
  });
  it('dias UTC incluem o último milissegundo e excluem o dia seguinte', async () => {
    const a = await actor();
    await seed(3);
    const rows = await c().db!.collection('orders').find().toArray();
    for (let i = 0; i < 3; i++)
      await c()
        .db!.collection('orders')
        .updateOne(
          { _id: rows[i]!._id },
          {
            $set: {
              createdAt: new Date(
                [
                  '2026-10-21T23:59:59.999Z',
                  '2026-10-22T23:59:59.999Z',
                  '2026-10-23T00:00:00.000Z',
                ][i]!,
              ),
            },
          },
        );
    expect((await get('?desde=2026-10-22&ate=2026-10-22', a)).body.total).toBe(1);
    expect((await get('?desde=2026-10-23', a)).body.total).toBe(1);
  });
  it('detalhe usa snapshots mesmo depois de alterar catálogo e identifica nomes como atuais', async () => {
    const a = await actor(),
      [r] = await seed();
    await c()
      .db!.collection('products')
      .insertOne({ nome: 'Nome atual diferente', precoReferenciaCent: 9999 });
    const detail = (await get('/' + r!._id, a).expect(200)).body;
    expect(detail).toMatchObject({
      totalCent: 75,
      comprador: { contaId: orderFixtureBuyer.toHexString(), nomeAtual: 'Comprador de teste' },
      linhas: [
        { nome: 'Produto fictício', precoReferenciaCent: 150, subtotalCent: 75, quantidade: 500 },
      ],
      entrega: { modalidade: 'levantamento', localLevantamento: 'Local fictício de levantamento' },
    });
    expect(detail).not.toHaveProperty('historicoEstado');
    expect((await get('/' + r!._id + '/history', a)).body.itens[0]).toMatchObject({
      para: 'pendente',
    });
  });
  it('históricos separados, paginados, sem reconstruir de nem inventar eventos', async () => {
    const a = await actor(),
      [r] = await seed();
    const history = Array.from({ length: 14 }, (_, i) => ({
      ...orderEvent('e' + i, 'confirmada', 'produtor', i),
      de: 'pendente',
    }));
    await c()
      .db!.collection('orders')
      .updateOne({ _id: r!._id }, { $set: { historicoEstado: history } });
    const first = (await get('/' + r!._id + '/history', a)).body,
      second = (await get('/' + r!._id + '/history?pagina=2', a)).body;
    expect(first).toMatchObject({ dominio: 'operacional', total: 14, totalPaginas: 2 });
    expect(first.itens).toHaveLength(12);
    expect(second.itens).toHaveLength(2);
    expect(first.itens[0]).toMatchObject({
      de: 'pendente',
      para: 'confirmada',
      responsavel: { tipo: 'utilizador', papel: 'produtor' },
    });
    expect((await get('/' + r!._id + '/history?dominio=pagamento', a)).body).toMatchObject({
      dominio: 'pagamento',
      total: 1,
      itens: [{ para: 'por_pagar' }],
    });
    await c()
      .db!.collection('orders')
      .updateOne({ _id: r!._id }, { $set: { 'pagamento.historico': [] } });
    expect((await get('/' + r!._id + '/history?dominio=pagamento', a)).body.total).toBe(0);
  });
  it('não divulga segredos, contactos ou evidência técnica; GET não altera documentos', async () => {
    const a = await actor(),
      [r] = await seed();
    const snapshot = await c().db!.collection('orders').findOne({ _id: r!._id });
    const detail = await get('/' + r!._id, a),
      list = await get('', a),
      history = await get('/' + r!._id + '/history', a);
    for (const response of [detail, list, history])
      for (const field of [
        'passwordHash',
        'emailNormalizado',
        'idempotencia',
        'hashCanonico',
        'comandoId',
        'versaoObservada',
        'versaoUnidade',
        'contacto',
        'revisaoOperacional',
      ])
        expect(JSON.stringify(response.body)).not.toContain('"' + field + '"');
    expect(await c().db!.collection('orders').findOne({ _id: r!._id })).toEqual(snapshot);
  });
  it('ausente 404; conta relacionada removida mantém referência histórica sem inventar nome', async () => {
    const a = await actor(),
      [r] = await seed();
    await c().db!.collection('users').deleteOne({ _id: orderFixtureBuyer });
    expect((await get('/' + r!._id, a)).body.comprador).toEqual({
      contaId: orderFixtureBuyer.toHexString(),
      nomeAtual: null,
    });
    await get('/' + new Types.ObjectId(), a).expect(404);
    await get('/' + new Types.ObjectId() + '/history', a).expect(404);
  });
  it.each(['comprador', 'produtor'] as const)(
    '%s não supervisiona encomendas de terceiros',
    async (role) => {
      const a = await actor([role]);
      await seed();
      await get('', a).expect(403);
    },
  );
  it('JWT antigo não mantém acesso após desativação ou remoção do papel', async () => {
    const a = await actor();
    await seed();
    await get('', a).expect(200);
    await c()
      .db!.collection('users')
      .updateOne({ _id: a.id }, { $set: { papeis: ['comprador'] } });
    await get('', a).expect(403);
    await c()
      .db!.collection('users')
      .updateOne({ _id: a.id }, { $set: { papeis: ['administrador'], ativo: false } });
    await get('', a).expect(401);
  });
  it('vazio são contagens reais, sem receita presumida', async () => {
    const a = await actor();
    const r = (await get('', a)).body;
    expect(r).toMatchObject({ total: 0, itens: [], indicadores: { numeroEncomendas: 0 } });
    expect(Object.values(r.indicadores.porEstado)).toEqual([0, 0, 0, 0, 0, 0]);
    expect(r.indicadores).not.toHaveProperty('receita');
  });
  it.each(['pendente', 'confirmada', 'em_preparacao', 'pronta', 'concluida', 'cancelada'])(
    'conta estado persistido %s, sem inferir pagamento',
    async (state) => {
      const a = await actor(),
        [r] = await seed();
      await c()
        .db!.collection('orders')
        .updateOne({ _id: r!._id }, { $set: { estado: state } });
      const response = (await get('?estado=' + state, a).expect(200)).body;
      expect(response.indicadores.porEstado[state]).toBe(1);
      expect(response.itens[0].pagamento.estado).toBe('por_pagar');
    },
  );
  it('entrega mantém morada/período histórico mas omite contacto privado', async () => {
    const a = await actor(),
      [r] = await seed();
    const old = await c().db!.collection('orders').findOne({ _id: r!._id });
    await c()
      .db!.collection('orders')
      .updateOne(
        { _id: r!._id },
        {
          $set: {
            'entrega.snapshot': {
              ...old!.entrega.snapshot,
              tipo: 'entrega',
              morada: 'Morada inicial fictícia',
              concelhoId: 'concelho-ficticio',
              contacto: 'privado',
            },
          },
        },
      );
    const response = (await get('/' + r!._id, a).expect(200)).body;
    expect(response.entrega).toMatchObject({
      modalidade: 'entrega',
      morada: 'Morada inicial fictícia',
    });
    expect(response.entrega).not.toHaveProperty('contacto');
  });
});
