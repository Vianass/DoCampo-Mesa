import { randomUUID } from 'node:crypto';
import { Types } from 'mongoose';
import request from 'supertest';
import { beforeAll, beforeEach, afterAll, describe, it, expect, vi } from 'vitest';
import { createApp } from '../../src/app.js';
import { connectDatabase } from '../../src/database/connection.js';
import { parseEnvironment } from '../../src/config/environment.js';
import { createAuthService } from '../../src/modules/auth/auth.service.js';
import { createAdminService } from '../../src/modules/admin/admin.service.js';
import { createAccountAuditModel } from '../../src/modules/admin/admin.models.js';
import { createUserModel, type UserRole } from '../../src/modules/users/user.model.js';
import { userInput } from '../support/identity-fixtures.js';
import { authConfiguration, authToken } from '../support/auth-fixtures.js';
let database: Awaited<ReturnType<typeof connectDatabase>>,
  app: ReturnType<typeof createApp>,
  service: ReturnType<typeof createAdminService>,
  auth: ReturnType<typeof createAuthService>;
const config = authConfiguration(),
  c = () => database.connection,
  base = '/api/admin';
beforeAll(async () => {
  database = await connectDatabase(
    parseEnvironment({
      NODE_ENV: 'test',
      MONGODB_URI: 'mongodb://127.0.0.1:27019/?replicaSet=rs-dcm-test&directConnection=true',
      MONGODB_DB_NAME: 'docampo_test_' + randomUUID().replaceAll('-', ''),
    }),
  );
  auth = createAuthService(c(), config);
  service = createAdminService(c(), config.secret);
  await auth.prepare();
  await service.prepare();
  app = createApp({
    auth,
    admin: service,
    security: config,
    adminLimits: { ipLimit: 100000, accountLimit: 100000 },
  });
});
beforeEach(async () => {
  for (const name of ['users', 'producers', 'products', 'orders', 'auctions', 'user_state_audit'])
    await c().db!.collection(name).deleteMany({});
});
afterAll(async () => {
  if (database)
    try {
      await c().dropDatabase();
    } finally {
      await database.close();
    }
});
async function actor(roles: UserRole[] = ['administrador'], name = 'Pessoa fictícia') {
  const id = new Types.ObjectId();
  await createUserModel(c()).create(
    userInput({
      _id: id,
      nome: name,
      emailNormalizado: id.toHexString() + '@example.invalid',
      papeis: roles,
    }),
  );
  return { id, token: await authToken(config, id.toHexString()) };
}
type Actor = Awaited<ReturnType<typeof actor>>;
const bearer = (r: request.Test, a: Actor) => r.set('Authorization', 'Bearer ' + a.token);
const detail = (a: Actor, id: Types.ObjectId) => bearer(request(app).get(base + '/users/' + id), a);
const change = (a: Actor, id: Types.ObjectId, active: boolean, tag?: string, body?: object) => {
  const r = bearer(request(app).patch(base + '/users/' + id + '/state'), a);
  if (tag) r.set('If-Match', tag);
  return r.send(body ?? { ativo: active, motivo: 'Decisão fictícia de revisão da conta.' });
};
const events = () => c().db!.collection('user_state_audit').find().toArray();
describe('administração com MongoDB real', () => {
  it('indicadores usam modelos e relógio MongoDB, sem contar perfis/contas inelegíveis ou leilões expirados', async () => {
    const admin = await actor(),
      buyer = await actor(['comprador']),
      producer = await actor(['comprador', 'produtor']);
    const inactive = await actor(['produtor']);
    await c()
      .db!.collection('users')
      .updateOne({ _id: inactive.id }, { $set: { ativo: false } });
    await c()
      .db!.collection('producers')
      .insertMany([
        { userId: producer.id, aprovacao: { estado: 'aprovado' } },
        { userId: inactive.id, aprovacao: { estado: 'aprovado' } },
        { userId: buyer.id, aprovacao: { estado: 'pendente' } },
      ]);
    await c()
      .db!.collection('products')
      .insertMany([
        { produtor: producer.id, estadoPublicacao: 'publicado', stockDisponivel: 0 },
        { produtor: inactive.id, estadoPublicacao: 'publicado' },
        { produtor: producer.id, estadoPublicacao: 'rascunho' },
      ]);
    await c().db!.collection('orders').insertOne({ comprador: buyer.id });
    const now = Date.now();
    await c()
      .db!.collection('auctions')
      .insertMany([
        { estado: 'agendado', iniciaEm: new Date(now - 1000), terminaEm: new Date(now + 60000) },
        { estado: 'ativo', iniciaEm: new Date(now - 60000), terminaEm: new Date(now - 1000) },
        { estado: 'cancelado', iniciaEm: new Date(now - 1000), terminaEm: new Date(now + 60000) },
      ]);
    const r = await bearer(request(app).get(base + '/dashboard'), admin).expect(200);
    expect(r.body).toMatchObject({
      totalUtilizadores: 4,
      compradoresAtivos: 2,
      produtoresAprovados: 1,
      candidaturasPendentes: 1,
      produtosPublicados: 1,
      encomendas: 1,
      leiloesAtivos: 1,
    });
    expect(Number.isFinite(Date.parse(r.body.observadoEm))).toBe(true);
  });
  it('dashboard sem atividade tem zeros reais', async () => {
    const a = await actor();
    expect((await bearer(request(app).get(base + '/dashboard'), a).expect(200)).body).toMatchObject(
      {
        totalUtilizadores: 1,
        compradoresAtivos: 0,
        produtoresAprovados: 0,
        candidaturasPendentes: 0,
        produtosPublicados: 0,
        encomendas: 0,
        leiloesAtivos: 0,
      },
    );
  });
  it('pesquisa literal, filtros combinados e paginação real usam só projeções permitidas', async () => {
    const a = await actor();
    for (let i = 0; i < 13; i++) await actor(['comprador'], 'Horta ' + i);
    const r = await bearer(
      request(app).get(
        base + '/users?papel=comprador&estado=ativo&pesquisa=Horta&pagina=2&porPagina=12',
      ),
      a,
    ).expect(200);
    expect(r.body).toMatchObject({ total: 13, pagina: 2, totalPaginas: 2 });
    expect(r.body.itens).toHaveLength(1);
    expect(Object.keys(r.body.itens[0]).sort()).toEqual([
      'ativo',
      'email',
      'id',
      'nome',
      'papeis',
      'registadoEm',
    ]);
    expect(
      (await bearer(request(app).get(base + '/users?pesquisa=%5B.*'), a).expect(200)).body.total,
    ).toBe(0);
  });
  it('estado e auditoria são atómicos; JWT antigo é recusado enquanto inativo e reativação conserva papéis', async () => {
    const a = await actor(),
      b = await actor(['comprador']);
    const before = await detail(a, b.id).expect(200);
    const off = await change(a, b.id, false, before.headers.etag).expect(200);
    expect(off.body).toMatchObject({
      ativo: false,
      papeis: ['comprador'],
      capacidades: { comprar: false, vender: false, administrar: false },
    });
    expect((await createUserModel(c()).findById(b.id).orFail()).ativo).toBe(false);
    await bearer(request(app).get('/api/auth/me'), b).expect(401);
    const first = await events();
    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({
      utilizadorId: b.id,
      administradorId: a.id,
      ativoAnterior: true,
      ativoAtual: false,
    });
    const on = await change(a, b.id, true, off.headers.etag).expect(200);
    expect(on.body.papeis).toEqual(['comprador']);
    await bearer(request(app).get('/api/auth/me'), b).expect(200);
    const history = await bearer(request(app).get(base + '/users/' + b.id + '/audit'), a).expect(
      200,
    );
    expect(history.body.total).toBe(2);
    expect(Object.keys(history.body.itens[0]).sort()).toEqual([
      'administradorId',
      'ativoAnterior',
      'ativoAtual',
      'id',
      'motivo',
      'ocorridoEm',
    ]);
  });
  it('recusa autodesativação sem alterar estado nem auditoria', async () => {
    const a = await actor();
    const before = await detail(a, a.id).expect(200);
    await change(a, a.id, false, before.headers.etag)
      .expect(409)
      .expect((r) => expect(r.body.codigo).toBe('AUTODESATIVACAO_PROIBIDA'));
    expect(await events()).toHaveLength(0);
    expect(
      await createUserModel(c()).countDocuments({ papeis: 'administrador', ativo: { $ne: false } }),
    ).toBe(1);
  });
  it('dois administradores não se conseguem eliminar mutuamente; sobrevive um administrador ativo', async () => {
    const a = await actor(),
      b = await actor();
    const [av, bv] = await Promise.all([detail(a, b.id), detail(b, a.id)]);
    const results = await Promise.all([
      change(a, b.id, false, av.headers.etag),
      change(b, a.id, false, bv.headers.etag),
    ]);
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    const refused = results.find((r) => r.status !== 200)!;
    expect([401, 409]).toContain(refused.status);
    expect(['AUTENTICACAO_INVALIDA', 'ESTADO_CONFLITO']).toContain(refused.body.codigo);
    // A rejeição pode ocorrer no limite de retry antes de reler a conta desativada.
    // A invariável é a persistência de uma única decisão e um administrador ativo.
    expect(
      await createUserModel(c()).countDocuments({ papeis: 'administrador', ativo: { $ne: false } }),
    ).toBe(1);
    expect(await events()).toHaveLength(1);
  });
  it('decisões concorrentes sobre uma conta aceitam uma só alteração/auditoria', async () => {
    const a = await actor(),
      b = await actor(),
      u = await actor(['comprador']);
    const tag = (await detail(a, u.id)).headers.etag;
    const results = await Promise.all([change(a, u.id, false, tag), change(b, u.id, false, tag)]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 412]);
    expect(await events()).toHaveLength(1);
  });
  it.each([undefined, '*', '"' + 'a'.repeat(43) + '"'])(
    'rejeita If-Match inválido/desatualizado %s',
    async (tag) => {
      const a = await actor(),
        u = await actor(['comprador']);
      await change(a, u.id, false, tag).expect(tag === undefined ? 428 : tag === '*' ? 400 : 412);
      expect(await events()).toHaveLength(0);
      expect((await createUserModel(c()).findById(u.id).orFail()).ativo).toBe(true);
    },
  );
  it('repetir após commit não duplica transição e exige reler o estado', async () => {
    const a = await actor(),
      u = await actor(['comprador']);
    const tag = (await detail(a, u.id)).headers.etag;
    const done = await change(a, u.id, false, tag).expect(200);
    await change(a, u.id, false, tag).expect(412);
    await change(a, u.id, false, done.headers.etag).expect(409);
    expect(await events()).toHaveLength(1);
  });
  it('falha de inserção de auditoria reverte estado, revisão, guarda e fence do autor', async () => {
    const a = await actor(),
      u = await actor(['comprador']);
    const tag = (await detail(a, u.id)).headers.etag;
    const spy = vi
      .spyOn(createAccountAuditModel(c()), 'create')
      .mockRejectedValueOnce(Error('falha fictícia'));
    try {
      await change(a, u.id, false, tag).expect(500);
    } finally {
      spy.mockRestore();
    }
    expect((await createUserModel(c()).findById(u.id).orFail()).ativo).toBe(true);
    expect((await detail(a, u.id)).headers.etag).toBe(tag);
    expect(await events()).toHaveLength(0);
  });
  it.each(['comprador', 'produtor'] as const)(
    '%s não lê nem altera por JWT válido',
    async (role) => {
      const a = await actor([role]),
        u = await actor(['comprador']);
      await bearer(request(app).get(base + '/dashboard'), a).expect(403);
      await detail(a, u.id).expect(403);
      await change(a, u.id, false, '"' + 'a'.repeat(43) + '"').expect(403);
    },
  );
  it('administrador inativo ou sem papel atual perde poderes mesmo com token antigo', async () => {
    const a = await actor(),
      u = await actor(['comprador']);
    await c()
      .db!.collection('users')
      .updateOne({ _id: a.id }, { $set: { papeis: ['comprador'] } });
    await detail(a, u.id).expect(403);
    await c()
      .db!.collection('users')
      .updateOne({ _id: a.id }, { $set: { papeis: ['administrador'], ativo: false } });
    await detail(a, u.id).expect(401);
  });
  it('projeção e capacidades não inventam aprovação para um papel produtor', async () => {
    const a = await actor(),
      u = await actor(['produtor']);
    const r = await detail(a, u.id).expect(200);
    expect(r.body.capacidades.vender).toBe(false);
    for (const field of ['passwordHash', 'revisaoOperacional', 'token', '__v', 'updatedAt'])
      expect(r.body).not.toHaveProperty(field);
  });
  it('legado sem ativo é ativo e pode ser desativado sem mudar papéis', async () => {
    const a = await actor(),
      u = await actor(['comprador']);
    await c()
      .db!.collection('users')
      .updateOne({ _id: u.id }, { $unset: { ativo: '' } });
    const r = await detail(a, u.id).expect(200);
    expect(r.body.ativo).toBe(true);
    await change(a, u.id, false, r.headers.etag).expect(200);
  });
  it('utilizador inexistente e auditoria inexistente não dão dados nem uma mutação', async () => {
    const a = await actor(),
      id = new Types.ObjectId();
    await detail(a, id).expect(404);
    await bearer(request(app).get(base + '/users/' + id + '/audit'), a).expect(404);
    expect(await events()).toHaveLength(0);
  });
  it('auditoria não é editável pelo modelo nem pela API', async () => {
    const a = await actor(),
      u = await actor(['comprador']);
    await change(a, u.id, false, (await detail(a, u.id)).headers.etag).expect(200);
    await expect(
      createAccountAuditModel(c()).updateOne(
        { utilizadorId: u.id },
        { $set: { motivo: 'forjado' } },
      ),
    ).rejects.toThrow('Auditoria imutável');
    await bearer(request(app).delete(base + '/users/' + u.id), a).expect(404);
  });
});
