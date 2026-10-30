import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { Types } from 'mongoose';
import { beforeAll, afterAll, afterEach, describe, it, expect, vi } from 'vitest';
import {
  realtimeFixture,
  connectClient,
  command,
  nextEvent,
} from '../support/realtime-fixtures.js';
import { createUserModel, type UserRole } from '../../src/modules/users/user.model.js';
import { userInput } from '../support/identity-fixtures.js';
import { authToken } from '../support/auth-fixtures.js';
import { auctionRecord } from '../support/auction-fixtures.js';
let f: Awaited<ReturnType<typeof realtimeFixture>>;
beforeAll(async () => {
  f = await realtimeFixture({ adminSupervision: true, lifecycle: false });
});
afterEach(async () => {
  f?.disconnectClients();
  if (f) await vi.waitFor(() => expect(f.realtime.activeSockets).toBe(0));
});
afterAll(async () => {
  await f?.close();
});
async function admin(roles: UserRole[] = ['administrador']) {
  const user = await createUserModel(f.connection).create(
    userInput({ emailNormalizado: randomUUID() + '@example.invalid', papeis: roles }),
  );
  return { id: user._id, token: await authToken(f.security, user.id) };
}
const get = (path: string, token?: string) => {
  const r = request(f.server).get('/api/admin/auctions' + path);
  return token ? r.set('Authorization', 'Bearer ' + token) : r;
};
async function subject() {
  const s = await f.subject(),
    a = await f.service.create(s.seller, s.body, randomUUID());
  return { ...s, a: a.body, id: a.body.id };
}
const collection = () => f.connection.db!.collection('auctions');
describe('REST de supervisão com MongoDB real', () => {
  it('lista global, pagina no servidor, desempata por ID e respeita indicadores filtrados', async () => {
    const a = await admin(),
      s = await f.subject();
    const ids = [];
    for (let i = 0; i < 13; i++) {
      const r = await f.service.create(s.seller, s.body, randomUUID());
      ids.push(new Types.ObjectId(r.body.id));
    }
    await collection().updateMany(
      { _id: { $in: ids } },
      { $set: { createdAt: new Date('2026-10-30T00:00:00Z') } },
    );
    const query = '?produtor=' + s.seller.id;
    const first = (await get(query, a.token).expect(200)).body,
      second = (await get(query + '&pagina=2', a.token)).body;
    expect(first).toMatchObject({
      total: 13,
      totalPaginas: 2,
      indicadores: { numeroLeiloes: 13, numeroLicitacoes: 0, porEstado: { ativo: 13 } },
    });
    expect(first.itens).toHaveLength(12);
    expect(second.itens).toHaveLength(1);
    const got = [...first.itens, ...second.itens].map((x: { id: string }) => x.id);
    expect(got).toEqual(
      ids
        .map((id) => id.toHexString())
        .sort()
        .reverse(),
    );
    expect((await get(query + '&pagina=999', a.token)).body).toMatchObject({
      itens: [],
      total: 13,
      totalPaginas: 2,
    });
    expect(
      (await get(query + '&ordem=antigas&porPagina=24', a.token)).body.itens.map(
        (x: { id: string }) => x.id,
      ),
    ).toEqual([...got].reverse());
  });
  it('pesquisa exata e filtros combinados, sem regex ou perfil no lugar da conta', async () => {
    const a = await admin(),
      s = await subject();
    const q =
      '?estado=ativo&produtor=' +
      s.seller.id +
      '&produto=' +
      s.body.produtoId +
      '&identificador=' +
      s.id;
    expect((await get(q, a.token)).body.total).toBe(1);
    expect((await get('?identificador=' + s.id + '&estado=cancelado', a.token)).body.total).toBe(0);
    await get('?identificador=.*', a.token).expect(400);
    await get('?estado=ativo&estado=agendado', a.token).expect(400);
  });
  it('dias de início UTC respeitam o limite final exclusivo', async () => {
    const a = await admin(),
      s = await subject();
    await collection().updateOne(
      { _id: new Types.ObjectId(s.id) },
      {
        $set: {
          iniciaEm: new Date('2026-10-22T23:59:59.999Z'),
          terminaEm: new Date('2026-11-01Z'),
        },
      },
    );
    expect(
      (await get('?identificador=' + s.id + '&desde=2026-10-22&ate=2026-10-22', a.token)).body
        .total,
    ).toBe(1);
    expect((await get('?identificador=' + s.id + '&desde=2026-10-23', a.token)).body.total).toBe(0);
  });
  it('detalhe administrativo é consulta pura e não materializa transições vencidas', async () => {
    const a = await admin(),
      r = auctionRecord();
    r.estado = 'agendado';
    r.iniciaEm = new Date(Date.now() - 10000);
    r.terminaEm = new Date(Date.now() + 60000);
    await collection().insertOne(r);
    const before = await collection().findOne({ _id: r._id });
    const detail = (await get('/' + r._id, a.token).expect(200)).body;
    expect(detail).toMatchObject({
      estado: 'agendado',
      estadoEmAtualizacao: true,
      numeroLicitacoes: 0,
    });
    expect(await collection().findOne({ _id: r._id })).toEqual(before);
  });
  it('preços e lote são snapshots; não se expõem compradores privados, reserva, chaves ou auditoria', async () => {
    const a = await admin(),
      s = await subject();
    await f.service.bid(s.buyers[0]!, s.id, { valorCent: 30100 }, randomUUID());
    const d = (await get('/' + s.id, a.token).expect(200)).body;
    expect(d).toMatchObject({
      precoBaseCent: 30000,
      licitacaoAtual: { valorCent: 30100 },
      numeroLicitacoes: 1,
      versao: 1,
    });
    expect(d.lider.referencia).toMatch(/^p_/);
    for (const k of [
      'passwordHash',
      'comprador',
      'criacao',
      'requestId',
      'requestHash',
      'reserva',
      'historico',
    ])
      expect(JSON.stringify(d)).not.toContain('"' + k + '"');
    expect(JSON.stringify(d)).not.toContain(s.buyers[0]!.id);
    expect(d).not.toHaveProperty('vencedor');
  });
  it('histórico paginado consistente com sequência/versão e pseudónimo da liderança', async () => {
    const a = await admin(),
      s = await subject();
    for (let i = 0; i < 13; i++)
      await f.service.bid(s.buyers[i % 2]!, s.id, { valorCent: 30100 + i * 100 }, randomUUID());
    const d = (await get('/' + s.id, a.token)).body,
      h = (await get('/' + s.id + '/bids?pagina=2', a.token)).body;
    expect(h).toMatchObject({
      total: 13,
      totalPaginas: 2,
      sequenciaSnapshot: 13,
      versaoSnapshot: 13,
    });
    expect(h.itens).toHaveLength(1);
    expect(h.itens[0]).toMatchObject({ sequencia: 1, confirmada: true });
    const newest = (await get('/' + s.id + '/bids', a.token)).body.itens[0];
    expect(newest.participante).toEqual(d.lider);
    expect(JSON.stringify(h)).not.toMatch(/requestId|requestHash|comprador/);
  });
  it('fecho confirmado preserva vencedor pseudonimizado, reserva e ausência de receitas fictícias', async () => {
    const a = await admin(),
      s = await subject();
    await f.service.bid(s.buyers[0]!, s.id, { valorCent: 30100 }, randomUUID());
    await collection().updateOne(
      { _id: new Types.ObjectId(s.id) },
      { $set: { terminaEm: new Date(Date.now() - 1000), iniciaEm: new Date(Date.now() - 2000) } },
    );
    await f.service.advance(new Types.ObjectId(s.id));
    const d = (await get('/' + s.id, a.token)).body;
    expect(d).toMatchObject({
      estado: 'terminado',
      resultado: { tipo: 'vencedor', valorCent: 30100 },
      vencedor: d.lider,
    });
    const indicators = (await get('?identificador=' + s.id, a.token)).body.indicadores;
    expect(indicators).toMatchObject({
      numeroLeiloes: 1,
      numeroLicitacoes: 1,
      valorOfertasVencedorasCent: 30100,
      porEstado: { terminado: 1 },
    });
    expect(indicators).not.toHaveProperty('receita');
  });
  it.each(['agendado', 'ativo', 'terminado', 'cancelado'] as const)(
    'conta apenas o estado persistido %s',
    async (estado) => {
      const a = await admin(),
        s = auctionRecord();
      s.estado = estado;
      await collection().insertOne(s);
      const r = (await get('?identificador=' + s._id + '&estado=' + estado, a.token)).body;
      expect(r.total).toBe(1);
      expect(r.indicadores.porEstado[estado]).toBe(1);
    },
  );
  it.each(['comprador', 'produtor'] as const)(
    '%s não supervisiona, nem mesmo por pedido direto',
    async (role) => {
      const a = await admin([role]),
        s = await subject();
      for (const path of ['', '/' + s.id, '/' + s.id + '/bids'])
        await get(path, a.token).expect(403);
    },
  );
  it('conta desativada ou papel retirado perde acesso com JWT antigo', async () => {
    const a = await admin();
    await get('', a.token).expect(200);
    await createUserModel(f.connection).collection.updateOne(
      { _id: a.id },
      { $set: { papeis: ['comprador'] } },
    );
    await get('', a.token).expect(403);
    await createUserModel(f.connection).collection.updateOne(
      { _id: a.id },
      { $set: { ativo: false, papeis: ['administrador'] } },
    );
    await get('', a.token).expect(401);
  });
  it('valida identificadores, filtros, paginação e ausência de escrita', async () => {
    const a = await admin(),
      s = await subject();
    await get('').expect(401);
    for (const q of [
      '?pagina=1001',
      '?porPagina=999',
      '?extra=1',
      '?desde=2026-02-30',
      '/invalido',
      '/' + s.id + '?extra=1',
    ])
      await get(q, a.token).expect(400);
    await get('/' + new Types.ObjectId(), a.token).expect(404);
    await get('/' + new Types.ObjectId() + '/bids', a.token).expect(404);
    const before = await collection().findOne({ _id: new Types.ObjectId(s.id) });
    for (const verb of ['post', 'patch', 'delete'] as const) {
      const client = request(f.server);
      await client[verb]('/api/admin/auctions/' + s.id)
        .set('Authorization', 'Bearer ' + a.token)
        .send({ estado: 'cancelado' })
        .expect(404);
    }
    expect(await collection().findOne({ _id: new Types.ObjectId(s.id) })).toEqual(before);
  });
});
describe('valores de ofertas vencedoras', () => {
  it('soma apenas resultados terminados com vencedor e respeita filtros, sem inferir receita', async () => {
    const a = await admin(),
      records = [auctionRecord(), auctionRecord(), auctionRecord()];
    records[0]!.estado = 'terminado';
    records[0]!.resultado = {
      tipo: 'vencedor',
      comprador: new Types.ObjectId(),
      bidId: new Types.ObjectId(),
      valorCent: 30100,
    };
    records[1]!.estado = 'ativo';
    records[1]!.licitacaoAtual.valorCent = 99999;
    records[2]!.estado = 'terminado';
    records[2]!.resultado = {
      tipo: 'sem_licitacoes',
      comprador: null,
      bidId: null,
      valorCent: null,
    };
    const producer = new Types.ObjectId();
    records.forEach((r) => (r.produtor = producer));
    await collection().insertMany(records);
    const r = (await get('?produtor=' + producer, a.token)).body;
    expect(r.indicadores.valorOfertasVencedorasCent).toBe(30100);
    expect(r.indicadores).not.toHaveProperty('receita');
    expect(
      (await get('?produtor=' + producer + '&estado=ativo', a.token)).body.indicadores
        .valorOfertasVencedorasCent,
    ).toBe(0);
  });
  it('não arredonda um agregado que excede o inteiro seguro', async () => {
    const a = await admin(),
      producer = new Types.ObjectId(),
      records = [auctionRecord(), auctionRecord()];
    for (const r of records) {
      r.produtor = producer;
      r.estado = 'terminado';
      r.resultado = {
        tipo: 'vencedor',
        comprador: new Types.ObjectId(),
        bidId: new Types.ObjectId(),
        valorCent: Number.MAX_SAFE_INTEGER,
      };
    }
    await collection().insertMany(records);
    await get('?produtor=' + producer, a.token).expect(503);
  });
});
describe('Socket.IO administrativo real', () => {
  it('subscrição global é exclusiva do administrador e envia só invalidações', async () => {
    const a = await admin(),
      s = await f.subject(),
      observer = f.client(a.token),
      buyer = f.client(s.buyerTokens[0]!);
    await Promise.all([connectClient(observer), connectClient(buyer)]);
    const denied = await command(buyer, 'admin:auctions:watch', {});
    expect(denied).toMatchObject({ ok: false, erro: { status: 403 } });
    await command(observer, 'admin:auctions:watch', {}).then((r) =>
      expect(r).toMatchObject({ ok: true, data: { subscrito: true } }),
    );
    let leaked = 0;
    buyer.on('admin:auctions:changed', () => leaked++);
    const hint = nextEvent(observer, 'admin:auctions:changed');
    await f.service.create(s.seller, s.body, randomUUID());
    expect(await hint).toEqual({ consultar: true });
    expect(leaked).toBe(0);
  });
  it('perda de papel administrativo bloqueia a publicação e a reconexão REST', async () => {
    const a = await admin(),
      s = await f.subject(),
      observer = f.client(a.token);
    await connectClient(observer);
    await command(observer, 'admin:auctions:watch', {});
    await createUserModel(f.connection).collection.updateOne(
      { _id: a.id },
      { $set: { papeis: ['comprador'] } },
    );
    const rejected = nextEvent(observer, 'auction:error', (e) => e.status === 403);
    await f.service.create(s.seller, s.body, randomUUID());
    expect((await rejected).status).toBe(403);
    await get('', a.token).expect(403);
  });
  it('sala por leilão reutilizada acompanha ofertas concorrentes e fecho sem comandos administrativos', async () => {
    const a = await admin(),
      s = await subject(),
      observer = f.client(a.token);
    await connectClient(observer);
    await command(observer, 'auction:join', { leilaoId: s.id });
    const changed = nextEvent(observer, 'auction:updated', (x) => x.sequencia === 1);
    const results = await Promise.allSettled(
      s.buyers.map((b) => f.service.bid(b, s.id, { valorCent: 30100 }, randomUUID())),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const state = await changed;
    expect(state.versao).toBe(1);
    const d = (await get('/' + s.id, a.token)).body;
    expect(d.licitacaoAtual.valorCent).toBe(state.valorAtualCent);
    expect(d.lider).toEqual(state.lider);
    const refused = await command(observer, 'auction:bid', {
      leilaoId: s.id,
      valorCent: 30200,
      requestId: randomUUID(),
    });
    expect(refused).toMatchObject({ ok: false, erro: { status: 403 } });
    await collection().updateOne(
      { _id: new Types.ObjectId(s.id) },
      { $set: { iniciaEm: new Date(Date.now() - 2000), terminaEm: new Date(Date.now() - 1000) } },
    );
    const ended = await nextEvent(observer, 'auction:ended');
    expect(ended.estado).toBe('terminado');
    expect((await get('/' + s.id, a.token)).body.resultado.bidId).toBe(ended.resultado?.bidId);
  });
});
