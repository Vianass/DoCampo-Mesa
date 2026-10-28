import { randomUUID } from 'node:crypto';
import { Types } from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app.js';
import { connectDatabase } from '../../src/database/connection.js';
import { parseEnvironment } from '../../src/config/environment.js';
import { createAuthService, type AuthPrincipal } from '../../src/modules/auth/auth.service.js';
import { createProducerApplicationService } from '../../src/modules/producer-applications/producer-application.service.js';
import { createProducerModel } from '../../src/modules/producers/producer.model.js';
import { createUserModel, type UserRole } from '../../src/modules/users/user.model.js';
import { createCatalogService } from '../../src/modules/catalog/catalog.service.js';
import { createAuctionService } from '../../src/modules/auctions/auction.service.js';
import { authConfiguration, authToken } from '../support/auth-fixtures.js';
import { userInput, producerInput, decisionInput } from '../support/identity-fixtures.js';
import { producerApplicationInput } from '../support/producer-application-fixtures.js';
import { seedAuctionActors } from '../support/auction-fixtures.js';
import { producerCommercialInput } from '../support/producer-commercial-fixtures.js';

let database: Awaited<ReturnType<typeof connectDatabase>>,
  app: ReturnType<typeof createApp>,
  service: ReturnType<typeof createProducerApplicationService>,
  auth: ReturnType<typeof createAuthService>;
const config = authConfiguration(),
  c = () => database.connection;
const selfPath = '/api/me/producer-application',
  adminPath = '/api/admin/producer-applications';
beforeAll(async () => {
  database = await connectDatabase(
    parseEnvironment({
      NODE_ENV: 'test',
      MONGODB_URI: 'mongodb://127.0.0.1:27019/?replicaSet=rs-dcm-test&directConnection=true',
      MONGODB_DB_NAME: 'docampo_test_' + randomUUID().replaceAll('-', ''),
    }),
  );
  auth = createAuthService(c(), config);
  service = createProducerApplicationService(c(), config.secret);
  const catalog = createCatalogService(c(), config.secret),
    auctions = createAuctionService(c(), config.secret);
  await auth.prepare();
  await service.prepare();
  await catalog.prepare();
  await auctions.prepare();
  app = createApp({
    auth,
    producerApplications: service,
    catalog,
    auctions,
    security: config,
    auctionLimits: { ipLimit: 100000, accountLimit: 100000 },
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
async function actor(roles: UserRole[] = ['comprador']) {
  const id = new Types.ObjectId();
  await createUserModel(c()).create(
    userInput({ _id: id, emailNormalizado: id.toHexString() + '@example.invalid', papeis: roles }),
  );
  const token = await authToken(config, id.toHexString());
  return { id, token, principal: await auth.authenticate(token) };
}
type Actor = Awaited<ReturnType<typeof actor>>;
const bearer = (r: request.Test, who: Actor) => r.set('Authorization', 'Bearer ' + who.token);
const submit = (who: Actor, body: object = producerApplicationInput()) =>
  bearer(request(app).post(selfPath), who).send(body);
const own = (who: Actor) => bearer(request(app).get(selfPath), who);
const detail = (who: Actor, id: string) => bearer(request(app).get(adminPath + '/' + id), who);
const decide = (
  who: Actor,
  id: string,
  etag: string | undefined,
  action = 'approve',
  body = action === 'reject' ? { justificacao: 'Falta detalhe da atividade.' } : {},
) => {
  if (!etag) throw new Error('A leitura anterior deve devolver ETag.');
  return bearer(request(app).post(adminPath + '/' + id + '/' + action), who)
    .set('If-Match', etag)
    .send(body);
};
const userRow = (who: Actor) => createUserModel(c()).findById(who.id).lean().orFail();
const producerRow = (id: string) =>
  createProducerModel(c())
    .findById(id)
    .select('+telefone +aprovacao.decisao.autor +historicoCandidaturas +comercial.pagamentoPrivado')
    .lean()
    .orFail();
async function scenario() {
  const applicant = await actor(),
    admin = await actor(['administrador']);
  const submitted = await submit(applicant).expect(201),
    managed = await detail(admin, submitted.body.id).expect(200);
  return {
    applicant,
    admin,
    id: submitted.body.id as string,
    etag: managed.headers.etag as string,
  };
}
describe('candidaturas e aprovação em replica set real', () => {
  it('submete, cria perfil pendente real, conserva o comprador e não concede produtor', async () => {
    const applicant = await actor(),
      result = await submit(applicant).expect(201);
    expect(result.body).toMatchObject({
      ...producerApplicationInput(),
      estado: 'pendente',
      historico: [],
    });
    expect((await producerRow(result.body.id)).userId).toEqual(applicant.id);
    expect((await userRow(applicant)).papeis).toEqual(['comprador']);
    expect(result.headers['cache-control']).toBe('no-store');
    await bearer(request(app).get('/api/me/products'), applicant).expect(403);
    await bearer(request(app).get('/api/me/producer/auctions'), applicant).expect(403);
  });
  it.each(['nomePublico', 'localidade', 'concelho', 'descricao', 'telefone'])(
    'dados inválidos em %s não criam perfil nem capacidades',
    async (field) => {
      const applicant = await actor();
      await submit(applicant, { ...producerApplicationInput(), [field]: '' }).expect(400);
      expect(await createProducerModel(c()).countDocuments({ userId: applicant.id })).toBe(0);
      expect((await userRow(applicant)).papeis).toEqual(['comprador']);
    },
  );
  it('recusa JWT ausente, expirado e adulterado sem criar candidatura', async () => {
    const applicant = await actor();
    await request(app).post(selfPath).send(producerApplicationInput()).expect(401);
    const now = Math.floor(Date.now() / 1000);
    for (const token of [
      await authToken(config, applicant.id.toHexString(), { iat: now - 4000, exp: now - 1 }),
      applicant.token + 'adulterado',
    ])
      await request(app)
        .post(selfPath)
        .set('Authorization', 'Bearer ' + token)
        .send(producerApplicationInput())
        .expect(401);
    expect(await createProducerModel(c()).countDocuments({ userId: applicant.id })).toBe(0);
  });
  it('conta desativada perde submissão e consulta com o mesmo JWT', async () => {
    const applicant = await actor();
    await c()
      .db!.collection('users')
      .updateOne({ _id: applicant.id }, { $set: { ativo: false } });
    await submit(applicant).expect(401);
    await own(applicant).expect(401);
    await expect(
      service.submit(applicant.principal, producerApplicationInput()),
    ).rejects.toMatchObject({ status: 401 });
  });
  it('bloqueia duplicado pendente e duplicado aprovado', async () => {
    const s = await scenario();
    await submit(s.applicant).expect(409);
    await decide(s.admin, s.id, s.etag).expect(200);
    await submit(s.applicant).expect(409);
    expect(await createProducerModel(c()).countDocuments({ userId: s.applicant.id })).toBe(1);
  });
  it('submissões concorrentes resultam num único perfil e uma resposta de conflito', async () => {
    const applicant = await actor();
    const results = await Promise.all([submit(applicant), submit(applicant)]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(await createProducerModel(c()).countDocuments({ userId: applicant.id })).toBe(1);
    expect((await userRow(applicant)).papeis).toEqual(['comprador']);
  });
  it('isola a consulta própria e impede consultar a candidatura de outro candidato', async () => {
    const a = await actor(),
      b = await actor(),
      created = await submit(a).expect(201);
    expect((await own(a).expect(200)).body.id).toBe(created.body.id);
    await own(b).expect(404);
    await bearer(request(app).get(selfPath + '?userId=' + a.id), b).expect(400);
    await detail(b, created.body.id).expect(403);
  });
  it('lista e filtra candidaturas reais com contagem e ordenação estáveis', async () => {
    const s = await scenario();
    await decide(s.admin, s.id, s.etag, 'reject').expect(200);
    const result = await bearer(
      request(app).get(adminPath + '?estado=rejeitado&porPagina=12&ordem=antigas'),
      s.admin,
    ).expect(200);
    expect(result.body.itens.some((row: { id: string }) => row.id === s.id)).toBe(true);
    expect(result.body.total).toBe(
      await createProducerModel(c()).countDocuments({ 'aprovacao.estado': 'rejeitado' }),
    );
    expect(result.body.totalPaginas).toBe(Math.ceil(result.body.total / 12));
    expect(JSON.stringify(result.body)).not.toMatch(
      /telefone|descricao|password|justificacao|historico/,
    );
    const page = await bearer(request(app).get(adminPath + '?pagina=1000'), s.admin).expect(200);
    expect(page.body.itens).toEqual([]);
  });
  it.each(['comprador', 'produtor'] as const)(
    '%s não pode listar, detalhar ou decidir',
    async (role) => {
      const s = await scenario(),
        other = await actor([role]);
      await bearer(request(app).get(adminPath), other).expect(403);
      await detail(other, s.id).expect(403);
      for (const action of ['approve', 'reject'])
        await decide(other, s.id, s.etag, action).expect(403);
      expect((await producerRow(s.id)).aprovacao.estado).toBe('pendente');
    },
  );
  it('aprova atomicamente com auditoria e papel acumulável; o JWT existente reflete a alteração', async () => {
    const s = await scenario();
    const approved = await decide(s.admin, s.id, s.etag).expect(200);
    expect(approved.body).toMatchObject({
      id: s.id,
      estado: 'aprovado',
      decisao: { administradorId: s.admin.id.toHexString() },
    });
    const profile = await producerRow(s.id),
      user = await userRow(s.applicant);
    expect(profile.aprovacao.estado).toBe('aprovado');
    expect(profile.aprovacao.decisao!.autor).toEqual(s.admin.id);
    expect(profile.aprovacao.decisao!.data >= profile.aprovacao.submetidaEm).toBe(true);
    expect(user.papeis).toEqual(['comprador', 'produtor']);
    expect((await auth.authenticate(s.applicant.token)).papeis).toEqual(['comprador', 'produtor']);
    await bearer(request(app).get('/api/me/products'), s.applicant).expect(200);
    await bearer(request(app).get('/api/me/producer/auctions'), s.applicant).expect(200);
    expect(profile.comercial).toBeUndefined();
  });
  it('rejeita com motivo e auditoria, sem conceder produtor', async () => {
    const s = await scenario();
    await decide(s.admin, s.id, s.etag, 'reject').expect(200);
    const current = await own(s.applicant).expect(200);
    expect(current.body).toMatchObject({
      estado: 'rejeitado',
      decisao: { justificacao: 'Falta detalhe da atividade.' },
    });
    expect(current.body.decisao.administradorId).toBeUndefined();
    expect((await producerRow(s.id)).aprovacao.decisao!.autor).toEqual(s.admin.id);
    expect((await userRow(s.applicant)).papeis).toEqual(['comprador']);
  });
  it.each(['approve', 'reject'])(
    'decisão repetida %s é rejeitada coerentemente sem duplicar auditoria',
    async (action) => {
      const s = await scenario();
      const first = await decide(s.admin, s.id, s.etag, action).expect(200);
      await decide(s.admin, s.id, s.etag, action).expect(412);
      await decide(s.admin, s.id, first.headers.etag, action).expect(409);
      const current = await producerRow(s.id);
      expect(current.historicoCandidaturas ?? []).toHaveLength(0);
      expect(current.aprovacao.decisao!.data.toISOString()).toBe(first.body.decisao.data);
      expect(
        (await userRow(s.applicant)).papeis.filter((role) => role === 'produtor'),
      ).toHaveLength(action === 'approve' ? 1 : 0);
    },
  );
  it('duas decisões opostas concorrentes têm exatamente um vencedor', async () => {
    const s = await scenario(),
      another = await actor(['administrador']);
    const results = await Promise.all([
      decide(s.admin, s.id, s.etag),
      decide(another, s.id, s.etag, 'reject'),
    ]);
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect([409, 412]).toContain(results.find((r) => r.status !== 200)!.status);
    const profile = await producerRow(s.id),
      user = await userRow(s.applicant);
    expect(user.papeis.includes('produtor')).toBe(profile.aprovacao.estado === 'aprovado');
    expect(profile.aprovacao.decisao!.autor.toHexString()).toBe(
      profile.aprovacao.estado === 'aprovado' ? s.admin.id.toHexString() : another.id.toHexString(),
    );
  });
  it('aprovações concorrentes pelo mesmo admin não duplicam o papel nem a decisão', async () => {
    const s = await scenario();
    const results = await Promise.all([
      decide(s.admin, s.id, s.etag),
      decide(s.admin, s.id, s.etag),
    ]);
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect([409, 412]).toContain(results.find((r) => r.status !== 200)!.status);
    expect((await userRow(s.applicant)).papeis).toEqual(['comprador', 'produtor']);
    await decide(s.admin, s.id, s.etag).expect(412);
  });
  it.each(['candidato', 'administrador'])(
    'revalida %s alterado durante a transação antes do fence',
    async (kind) => {
      const s = await scenario(),
        collection = createUserModel(c()).collection;
      const original = collection.findOne.bind(collection),
        target = kind === 'candidato' ? s.applicant : s.admin;
      let changed = false;
      const spy = vi.spyOn(collection, 'findOne').mockImplementation(async (...args) => {
        const value = await original(...args);
        if (!changed && args[1]?.session && value?._id.equals(target.id)) {
          changed = true;
          // Outra operação confirmada depois da leitura snapshot, antes do primeiro write fence.
          await c()
            .db!.collection('users')
            .updateOne(
              { _id: target.id },
              {
                $set: kind === 'candidato' ? { ativo: false } : { papeis: ['comprador'] },
                $inc: { revisaoOperacional: 1 },
              },
            );
        }
        return value;
      });
      try {
        await decide(s.admin, s.id, s.etag).expect(kind === 'candidato' ? 409 : 403);
      } finally {
        spy.mockRestore();
      }
      expect(changed).toBe(true);
      expect((await producerRow(s.id)).aprovacao.estado).toBe('pendente');
      expect((await userRow(s.applicant)).papeis).toEqual(['comprador']);
    },
  );
  it('rollback depois de guardar a aprovação impede perfil aprovado sem capacidades', async () => {
    const s = await scenario(),
      users = createUserModel(c()).collection,
      original = users.updateOne.bind(users);
    const spy = vi.spyOn(users, 'updateOne').mockImplementation(async (...args) => {
      if ('$addToSet' in args[1]) throw new Error('Falha fictícia após escrita de perfil.');
      return original(...args);
    });
    try {
      await decide(s.admin, s.id, s.etag).expect(500);
    } finally {
      spy.mockRestore();
    }
    expect((await producerRow(s.id)).aprovacao.estado).toBe('pendente');
    expect((await userRow(s.applicant)).papeis).toEqual(['comprador']);
    expect((await detail(s.admin, s.id).expect(200)).headers.etag).toBe(s.etag);
    await decide(s.admin, s.id, s.etag).expect(200);
  });
  it('rollback da submissão não deixa perfil parcial', async () => {
    const applicant = await actor(),
      collection = createProducerModel(c()).collection;
    const spy = vi
      .spyOn(collection, 'insertOne')
      .mockRejectedValueOnce(new Error('Falha fictícia de persistência.'));
    try {
      await submit(applicant).expect(500);
    } finally {
      spy.mockRestore();
    }
    expect(await createProducerModel(c()).countDocuments({ userId: applicant.id })).toBe(0);
    expect((await userRow(applicant)).papeis).toEqual(['comprador']);
  });
  it('reapresenta sem duplicar perfil, preservando dados e autoria de todas as rejeições', async () => {
    const s = await scenario();
    const rejected = await decide(s.admin, s.id, s.etag, 'reject').expect(200);
    const second = await submit(s.applicant, {
      ...producerApplicationInput(),
      nomePublico: 'Segunda tentativa fictícia',
    }).expect(201);
    expect(second.body.id).toBe(s.id);
    expect(second.body.estado).toBe('pendente');
    expect(second.body.decisao).toBeUndefined();
    expect(second.body.historico).toHaveLength(1);
    expect(second.body.historico[0]).toMatchObject({
      ...producerApplicationInput(),
      estado: 'rejeitado',
      decisao: { data: rejected.body.decisao.data, justificacao: 'Falta detalhe da atividade.' },
    });
    const managed = await detail(s.admin, s.id).expect(200);
    expect(managed.body.historico[0].decisao.administradorId).toBe(s.admin.id.toHexString());
    await decide(s.admin, s.id, managed.headers.etag, 'reject').expect(200);
    const third = await submit(s.applicant).expect(201);
    expect(third.body.historico).toHaveLength(2);
    expect(third.body.historico[1].nomePublico).toBe('Segunda tentativa fictícia');
    await decide(s.admin, s.id, third.headers.etag).expect(200);
    expect((await own(s.applicant).expect(200)).body.historico).toHaveLength(2);
    expect(await createProducerModel(c()).countDocuments({ userId: s.applicant.id })).toBe(1);
  });
  it('decisão antiga não aprova uma tentativa reapresentada entretanto', async () => {
    const s = await scenario();
    const rejected = await decide(s.admin, s.id, s.etag, 'reject').expect(200);
    await submit(s.applicant).expect(201);
    await decide(s.admin, s.id, s.etag).expect(412);
    await decide(s.admin, s.id, rejected.headers.etag).expect(412);
    expect((await producerRow(s.id)).aprovacao.estado).toBe('pendente');
    expect((await userRow(s.applicant)).papeis).toEqual(['comprador']);
  });
  it('reapresentações concorrentes preservam uma única entrada histórica', async () => {
    const s = await scenario();
    await decide(s.admin, s.id, s.etag, 'reject').expect(200);
    const results = await Promise.all([submit(s.applicant), submit(s.applicant)]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect((await producerRow(s.id)).historicoCandidaturas).toHaveLength(1);
  });
  it.each(['approve', 'reject'])('candidato desativado não é elegível para %s', async (action) => {
    const s = await scenario();
    await c()
      .db!.collection('users')
      .updateOne({ _id: s.applicant.id }, { $set: { ativo: false } });
    const result = await decide(s.admin, s.id, s.etag, action).expect(409);
    expect(result.body.codigo).toBe('CANDIDATO_INELEGIVEL');
    expect((await producerRow(s.id)).aprovacao.estado).toBe('pendente');
    expect((await userRow(s.applicant)).papeis).toEqual(['comprador']);
  });
  it('admin desativado ou com papel removido perde acesso com JWT já emitido', async () => {
    const s = await scenario();
    await c()
      .db!.collection('users')
      .updateOne({ _id: s.admin.id }, { $set: { papeis: ['comprador'] } });
    await decide(s.admin, s.id, s.etag).expect(403);
    await expect(service.decide(s.admin.principal, s.id, 'aprovado', s.etag)).rejects.toMatchObject(
      { status: 403 },
    );
    await c()
      .db!.collection('users')
      .updateOne({ _id: s.admin.id }, { $set: { ativo: false } });
    await detail(s.admin, s.id).expect(401);
    await expect(
      service.list(s.admin.principal, { pagina: 1, porPagina: 12, ordem: 'recentes' }),
    ).rejects.toMatchObject({ status: 401 });
    expect((await producerRow(s.id)).aprovacao.estado).toBe('pendente');
  });
  it('permissões forjadas na principal interna não substituem os papéis atuais', async () => {
    const s = await scenario();
    const forged: AuthPrincipal = { ...s.applicant.principal, papeis: ['administrador'] };
    await expect(service.detail(forged, s.id)).rejects.toMatchObject({ status: 403 });
    await expect(service.decide(forged, s.id, 'aprovado', s.etag)).rejects.toMatchObject({
      status: 403,
    });
  });
  it('exige versão atual e rejeita ETag ausente, malformado e de outra candidatura', async () => {
    const s = await scenario(),
      other = await scenario();
    await bearer(request(app).post(adminPath + '/' + s.id + '/approve'), s.admin)
      .send({})
      .expect(428);
    await decide(s.admin, s.id, '*').expect(400);
    await decide(s.admin, s.id, other.etag).expect(412);
    expect((await producerRow(s.id)).aprovacao.estado).toBe('pendente');
  });
  it('IDs válidos inexistentes devolvem 404 sem divulgar dados internos', async () => {
    const admin = await actor(['administrador']),
      id = new Types.ObjectId().toHexString();
    await detail(admin, id).expect(404);
    const result = await decide(admin, id, '"' + 'a'.repeat(43) + '"').expect(404);
    expect(JSON.stringify(result.body)).not.toMatch(/Mongo|stack|password|token/);
  });
  it('contactos, autoria e histórico nunca aparecem no perfil público', async () => {
    const s = await scenario();
    await decide(s.admin, s.id, s.etag, 'reject').expect(200);
    const submitted = await submit(s.applicant).expect(201);
    await decide(s.admin, s.id, submitted.headers.etag).expect(200);
    const response = await request(app)
      .get('/api/producers/' + s.id)
      .expect(200);
    expect(JSON.stringify(response.body)).not.toMatch(
      /telefone|historicoCandidaturas|justificacao|administradorId|userId|passwordHash/,
    );
    const full = await createProducerModel(c())
      .findById(s.id)
      .select('+telefone +historicoCandidaturas +aprovacao.decisao.autor')
      .orFail();
    expect(JSON.stringify(full)).not.toMatch(/telefone|historicoCandidaturas|autor/);
  });
  it('produtor pendente legado mantém capacidades anteriores, mas só publica após aprovação', async () => {
    const applicant = await actor(['comprador', 'produtor']),
      admin = await actor(['administrador']);
    const p = await createProducerModel(c()).create(
      producerInput({ userId: applicant.id, comercial: producerCommercialInput() }),
    );
    const managed = await detail(admin, p.id).expect(200);
    await decide(admin, p.id, managed.headers.etag, 'reject').expect(200);
    expect((await userRow(applicant)).papeis).toEqual(['comprador', 'produtor']);
    const again = await submit(applicant).expect(201);
    await decide(admin, p.id, again.headers.etag).expect(200);
    expect((await producerRow(p.id)).comercial).toEqual(p.toObject({ transform: false }).comercial);
    expect((await userRow(applicant)).papeis).toEqual(['comprador', 'produtor']);
  });
  it('produtores aprovados legados mantêm catálogo e leilões operacionais, sem migração', async () => {
    const seeded = await seedAuctionActors(c()),
      seller: Actor = {
        id: new Types.ObjectId(seeded.seller.id),
        token: await authToken(config, seeded.seller.id),
        principal: seeded.seller,
      };
    const before = await producerRow(seeded.scenario.producers[0]!._id.toHexString());
    const current = await own(seller).expect(200);
    expect(current.body.estado).toBe('aprovado');
    expect(current.body.historico).toEqual([]);
    await submit(seller).expect(409);
    await request(app)
      .get('/api/products/' + seeded.scenario.products[0]!._id.toHexString())
      .expect(200);
    await bearer(request(app).post('/api/auctions'), seller)
      .set('Idempotency-Key', randomUUID())
      .send(seeded.body)
      .expect(201);
    const after = await producerRow(before._id.toHexString());
    expect(after.aprovacao).toEqual(before.aprovacao);
    expect(after.comercial).toEqual(before.comercial);
    expect(after.nomePublico).toBe(before.nomePublico);
  });
  it('conta candidata eliminada não recebe permissões nem decisão parcial', async () => {
    const s = await scenario();
    await c().db!.collection('users').deleteOne({ _id: s.applicant.id });
    await decide(s.admin, s.id, s.etag).expect(409);
    expect((await producerRow(s.id)).aprovacao.estado).toBe('pendente');
  });
  it('aprovação conserva todos os papéis já existentes sem duplicação', async () => {
    const applicant = await actor(['comprador', 'administrador']),
      admin = await actor(['administrador']);
    const submitted = await submit(applicant).expect(201);
    const current = await detail(admin, submitted.body.id).expect(200);
    await decide(admin, submitted.body.id, current.headers.etag).expect(200);
    expect((await userRow(applicant)).papeis).toEqual(['comprador', 'administrador', 'produtor']);
  });
  it('perfil aprovado anterior não pode voltar a candidatura nem alterar decisão', async () => {
    const applicant = await actor(['produtor']),
      admin = await actor(['administrador']);
    const record = await createProducerModel(c()).create(
      producerInput({ userId: applicant.id, aprovacao: decisionInput() }),
    );
    const current = await detail(admin, record.id).expect(200);
    await submit(applicant).expect(409);
    await decide(admin, record.id, current.headers.etag, 'reject').expect(409);
    expect((await producerRow(record.id)).aprovacao.estado).toBe('aprovado');
  });
});
