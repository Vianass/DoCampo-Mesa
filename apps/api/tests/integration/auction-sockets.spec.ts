import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Types, mongo } from 'mongoose';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  realtimeFixture,
  connectClient,
  command,
  nextEvent,
} from '../support/realtime-fixtures.js';
import type { BidAccepted } from '../../src/realtime/auction.protocol.js';
import { authToken } from '../support/auth-fixtures.js';
import { createAuctionService } from '../../src/modules/auctions/auction.service.js';
import { startApi } from '../../src/runtime.js';
import { ApiError } from '../../src/http/api-error.js';

let f: Awaited<ReturnType<typeof realtimeFixture>>;
beforeAll(async () => {
  f = await realtimeFixture();
});
afterEach(async () => {
  f?.disconnectClients();
  if (f)
    await vi.waitFor(() => {
      expect(f.realtime.activeSockets).toBe(0);
      expect(f.realtime.roomCount).toBe(0);
    });
});
afterAll(async () => {
  await f?.close();
});
const rows = () => f.connection.db!.collection('auctions');
const dbAuction = (id: string) => rows().findOne({ _id: new Types.ObjectId(id) });
async function setup(buyers = 2, input: object = {}) {
  const s = await f.subject(buyers),
    auction = await f.service.create(s.seller, { ...s.body, ...input }, randomUUID());
  const clients = s.buyerTokens.map((token) => f.client(token));
  await Promise.all(clients.map(connectClient));
  const body = { leilaoId: auction.body.id };
  for (const socket of clients) {
    const r = await command(socket, 'auction:join', body);
    assert(r.ok);
  }
  return { ...s, clients, auction, body };
}
const bid = (
  s: Awaited<ReturnType<typeof setup>>,
  index: number,
  valorCent = 30100,
  requestId = randomUUID(),
) => command<BidAccepted>(s.clients[index]!, 'auction:bid', { ...s.body, valorCent, requestId });
async function expire(id: string) {
  await rows().updateOne(
    { _id: new Types.ObjectId(id) },
    { $set: { iniciaEm: new Date(Date.now() - 2000), terminaEm: new Date(Date.now() - 1000) } },
  );
}
describe('Socket.IO, HTTP e MongoDB reais', () => {
  it('demonstração: dois compradores observam liderança, ofertas e fecho persistido iguais', async () => {
    const s = await setup(),
      [a, b] = s.clients;
    const bSawA = nextEvent(b!, 'auction:updated', (x) => x.sequencia === 1);
    const first = await bid(s, 0);
    assert(first.ok);
    expect(first.data.origem).toBe('nova');
    const state1 = await bSawA;
    expect(state1.bidId).toBe(first.data.licitacao.id);
    const aSawB = nextEvent(a!, 'auction:updated', (x) => x.sequencia === 2);
    const second = await bid(s, 1, 30500);
    assert(second.ok);
    const state2 = await aSawB;
    expect(state2.bidId).toBe(second.data.licitacao.id);
    const currentA = await command(a!, 'auction:state', s.body),
      currentB = await command(b!, 'auction:state', s.body);
    assert(currentA.ok && currentB.ok);
    expect(currentA.data.lider).toEqual(currentB.data.lider);
    expect(currentA.data.versao).toBe(2);
    const endedA = nextEvent(a!, 'auction:ended'),
      endedB = nextEvent(b!, 'auction:ended');
    await expire(s.auction.body.id);
    const [ea, eb] = await Promise.all([endedA, endedB]);
    expect(ea).toEqual(eb);
    expect(ea.estado).toBe('terminado');
    expect(ea.resultado?.valorCent).toBe(30500);
    const db = await dbAuction(s.auction.body.id);
    expect(db!.resultado.bidId.toHexString()).toBe(second.data.licitacao.id);
    expect(db!.resultado.comprador.toHexString()).toBe(s.buyers[1]!.id);
    expect(db!.reserva.estado).toBe('afeta_vencedor');
    expect(db!.versao).toBe(3);
    expect(await f.connection.db!.collection('bids').countDocuments({ leilao: db!._id })).toBe(2);
  });
  it.each(['', 'token-invalido'])('recusa JWT ausente/inválido %s', async (token) => {
    const socket = f.client(token);
    await expect(connectClient(socket)).rejects.toMatchObject({ data: { status: 401 } });
    expect(f.realtime.activeSockets).toBe(0);
  });
  it('recusa token expirado antes de ligar', async () => {
    const s = await f.subject(),
      now = Math.floor(Date.now() / 1000);
    const token = await authToken(f.security, s.buyers[0]!.id, { iat: now - 100, exp: now - 1 });
    await expect(connectClient(f.client(token))).rejects.toMatchObject({ data: { status: 401 } });
  });
  it('recusa conta inativa no handshake', async () => {
    const s = await f.subject();
    await f.connection
      .db!.collection('users')
      .updateOne({ _id: new Types.ObjectId(s.buyers[0]!.id) }, { $set: { ativo: false } });
    await expect(connectClient(f.client(s.buyerTokens[0]!))).rejects.toMatchObject({
      data: { status: 401 },
    });
  });
  it('estado inicial, presença de ligações e saída limpa', async () => {
    const s = await setup();
    const count = nextEvent(s.clients[0]!, 'auction:presence', (x) => x.ligacoes === 1);
    const r = await command(s.clients[1]!, 'auction:leave', s.body);
    assert(r.ok);
    expect((await count).ligacoes).toBe(1);
    const state = await command(s.clients[0]!, 'auction:state', s.body);
    assert(state.ok);
    expect(state.data.sequencia).toBe(0);
    expect(state.data.valorAtualCent).toBe(30000);
  });
  it('conta dois sockets da mesma pessoa como duas ligações, sem identidades', async () => {
    const s = await setup(1),
      second = f.client(s.buyerTokens[0]!);
    await connectClient(second);
    const p = nextEvent(s.clients[0]!, 'auction:presence', (x) => x.ligacoes === 2);
    const r = await command(second, 'auction:join', s.body);
    assert(r.ok);
    expect(await p).toEqual({ leilaoId: s.body.leilaoId, ligacoes: 2 });
  });
  it('sala inexistente e nomes internos arbitrários não dão acesso', async () => {
    const s = await f.subject(),
      socket = f.client(s.buyerTokens[0]!);
    await connectClient(socket);
    const missing = await command(socket, 'auction:join', {
      leilaoId: new Types.ObjectId().toHexString(),
    });
    assert(!missing.ok);
    expect(missing.erro.status).toBe(404);
    for (const payload of [
      { leilaoId: 'leilao:privado' },
      { leilaoId: new Types.ObjectId().toHexString(), room: 'admin:leiloes' },
    ]) {
      const r = await command(socket, 'auction:join', payload);
      assert(!r.ok);
      expect(r.erro.status).toBe(400);
    }
    expect(f.realtime.roomCount).toBe(0);
  });
  it('exige sala autorizada antes de consultar ou licitar', async () => {
    const s = await setup();
    await command(s.clients[0]!, 'auction:leave', s.body);
    for (const e of ['auction:state', 'auction:bid']) {
      const r = await command(s.clients[0]!, e, {
        ...s.body,
        ...(e.endsWith('bid') ? { valorCent: 30100, requestId: randomUUID() } : {}),
      });
      assert(!r.ok);
      expect(r.erro.status).toBe(403);
    }
  });
  it.each([0, -1, 1.5, 30000, 30099])(
    'oferta inválida/abaixo do mínimo %s não muda estado',
    async (value) => {
      const s = await setup(),
        before = await dbAuction(s.body.leilaoId),
        r = await bid(s, 0, value);
      assert(!r.ok);
      expect([400, 409]).toContain(r.erro.status);
      expect(await dbAuction(s.body.leilaoId)).toEqual(before);
    },
  );
  it.each(['versao', 'licitacaoAtual', 'comprador', 'estado'])(
    'recusa mass assignment de %s',
    async (field) => {
      const s = await setup(),
        before = await dbAuction(s.body.leilaoId);
      const r = await command(s.clients[0]!, 'auction:bid', {
        ...s.body,
        requestId: randomUUID(),
        valorCent: 31700,
        [field]: 'adulterado',
      });
      assert(!r.ok);
      expect(r.erro.status).toBe(400);
      expect(await dbAuction(s.body.leilaoId)).toEqual(before);
    },
  );
  it('duas ofertas iguais simultâneas produzem só um bid e um líder', async () => {
    const s = await setup(),
      rs = await Promise.all([bid(s, 0, 31700), bid(s, 1, 31700)]);
    expect(rs.filter((r) => r.ok)).toHaveLength(1);
    const refused = rs.find((r) => !r.ok);
    assert(refused && !refused.ok);
    expect(refused.erro.status).toBe(409);
    const db = await dbAuction(s.body.leilaoId);
    expect(db!.sequencia).toBe(1);
    expect(db!.versao).toBe(1);
    expect(await f.connection.db!.collection('bids').countDocuments({ leilao: db!._id })).toBe(1);
  });
  it('três compradores concorrentes mantêm sequência, incrementos e versões coerentes', async () => {
    const s = await setup(3),
      rs = await Promise.all([bid(s, 0, 30100), bid(s, 1, 30500), bid(s, 2, 31700)]);
    const db = await dbAuction(s.body.leilaoId),
      history = await f.connection
        .db!.collection('bids')
        .find({ leilao: db!._id })
        .sort({ sequencia: 1 })
        .toArray();
    expect(history.length).toBe(rs.filter((r) => r.ok).length);
    expect(history.map((b) => b.sequencia)).toEqual(history.map((_, i) => i + 1));
    let value = 30000;
    for (const b of history) {
      expect(b.valorCent).toBeGreaterThanOrEqual(value + 100);
      value = b.valorCent;
    }
    expect(db!.versao).toBe(history.length);
    expect(db!.licitacaoAtual.valorCent).toBe(31700);
  });
  it('payloads de sala não expõem identidade ou campos específicos de uma pessoa', async () => {
    const s = await setup(),
      update = nextEvent(s.clients[1]!, 'auction:updated');
    await bid(s, 0);
    const value = JSON.stringify(await update);
    for (const user of [...s.buyers, s.seller]) expect(value).not.toContain(user.id);
    expect(value).not.toMatch(
      /email|password|token|requestId|requestHash|proprio|reserva|historico/,
    );
  });
  it('isolamento entre salas impede atualizações cruzadas', async () => {
    const a = await setup(),
      b = await setup(),
      events: unknown[] = [];
    b.clients[0]!.on('auction:updated', (v) => events.push(v));
    await bid(a, 0);
    await new Promise((r) => setTimeout(r, 250));
    expect(events).toEqual([]);
  });
  it('REST e Socket.IO partilham ofertas, mínimos, idempotência e liderança', async () => {
    const s = await setup(),
      update = nextEvent(s.clients[0]!, 'auction:updated'),
      key = randomUUID();
    const rest = await request(f.server)
      .post('/api/auctions/' + s.body.leilaoId + '/bids')
      .set('Authorization', 'Bearer ' + s.buyerTokens[1])
      .set('Idempotency-Key', key)
      .send({ valorCent: 31700 })
      .expect(201);
    expect((await update).bidId).toBe(rest.body.licitacao.id);
    const replay = await bid(s, 1, 31700, key);
    assert(replay.ok);
    expect(replay.data.origem).toBe('replay');
    expect(replay.data.licitacao.id).toBe(rest.body.licitacao.id);
    const conflict = await bid(s, 0, 31700);
    assert(!conflict.ok);
    expect(conflict.erro.status).toBe(409);
  });
  it('varredura recupera um commit efetuado por outra instância sem notificação local', async () => {
    const s = await setup(),
      update = nextEvent(s.clients[1]!, 'auction:updated');
    const other = createAuctionService(f.connection, f.security.secret);
    await other.bid(s.buyers[0]!, s.body.leilaoId, { valorCent: 31700 }, randomUUID());
    expect((await update).valorAtualCent).toBe(31700);
  });
  it('não publica liderança antes do commit e publica depois da confirmação', async () => {
    const s = await setup(),
      received: unknown[] = [];
    s.clients[1]!.on('auction:updated', (state) => received.push(state));
    let prepared!: () => void, release!: () => void;
    const ready = new Promise<void>((r) => {
        prepared = r;
      }),
      gate = new Promise<void>((r) => {
        release = r;
      });
    const original = mongo.Collection.prototype.insertOne;
    const spy = vi
      .spyOn(mongo.Collection.prototype, 'insertOne')
      .mockImplementation(async function (
        this: mongo.Collection,
        ...args: Parameters<typeof original>
      ) {
        if (this.collectionName === 'bids' && String(args[0].leilao) === s.body.leilaoId) {
          prepared();
          await gate;
        }
        return original.apply(this, args);
      } as typeof original);
    const operation = bid(s, 0);
    try {
      await ready;
      await new Promise((r) => setTimeout(r, 250));
      expect((await dbAuction(s.body.leilaoId))!.sequencia).toBe(0);
      expect(received).toEqual([]);
      release();
      const r = await operation;
      assert(r.ok);
      await vi.waitFor(() => expect(received.length).toBeGreaterThan(0));
    } finally {
      release();
      spy.mockRestore();
      await operation;
    }
    expect((await dbAuction(s.body.leilaoId))!.sequencia).toBe(1);
  });
  it('rollback ao inserir bid não emite sucesso ou alteração e mantém versão', async () => {
    const s = await setup(),
      before = await dbAuction(s.body.leilaoId),
      updates: unknown[] = [],
      accepted: unknown[] = [];
    s.clients[1]!.on('auction:updated', (x) => updates.push(x));
    s.clients[0]!.on('auction:bid:accepted', (x) => accepted.push(x));
    const original = mongo.Collection.prototype.insertOne;
    const spy = vi.spyOn(mongo.Collection.prototype, 'insertOne').mockImplementation(function (
      this: mongo.Collection,
      ...args: Parameters<typeof original>
    ) {
      if (this.collectionName === 'bids' && String(args[0].leilao) === s.body.leilaoId)
        throw Error('falha fictícia interna');
      return original.apply(this, args);
    } as typeof original);
    try {
      const r = await bid(s, 0);
      assert(!r.ok);
      expect(r.erro.status).toBe(500);
      expect(JSON.stringify(r)).not.toContain('interna');
    } finally {
      spy.mockRestore();
    }
    await new Promise((r) => setTimeout(r, 250));
    expect(await dbAuction(s.body.leilaoId)).toEqual(before);
    expect(updates).toEqual([]);
    expect(accepted).toEqual([]);
  });
  it('alteração de papel depois do handshake bloqueia próxima licitação', async () => {
    const s = await setup();
    await f.connection
      .db!.collection('users')
      .updateOne(
        { _id: new Types.ObjectId(s.buyers[0]!.id) },
        { $set: { papeis: ['produtor'] }, $inc: { revisaoOperacional: 1 } },
      );
    const r = await bid(s, 0);
    assert(!r.ok);
    expect(r.erro.status).toBe(403);
    expect((await dbAuction(s.body.leilaoId))!.sequencia).toBe(0);
  });
  it('conta desativada após ligação perde salas e deixa de receber dados', async () => {
    const s = await setup(),
      error = nextEvent(s.clients[0]!, 'auction:error', (e) => e.status === 401);
    await f.connection
      .db!.collection('users')
      .updateOne(
        { _id: new Types.ObjectId(s.buyers[0]!.id) },
        { $set: { ativo: false }, $inc: { revisaoOperacional: 1 } },
      );
    expect((await error).status).toBe(401);
    await vi.waitFor(() => expect(s.clients[0]!.connected).toBe(false));
    const r = await bid(s, 1);
    assert(r.ok);
  });
  it('produtor não licita no próprio lote mesmo acumulando papéis', async () => {
    const s = await setup();
    await f.connection
      .db!.collection('users')
      .updateOne(
        { _id: new Types.ObjectId(s.seller.id) },
        { $set: { papeis: ['comprador', 'produtor'] }, $inc: { revisaoOperacional: 1 } },
      );
    const socket = f.client(s.sellerToken);
    await connectClient(socket);
    await command(socket, 'auction:join', s.body);
    const r = await command(socket, 'auction:bid', {
      ...s.body,
      valorCent: 31700,
      requestId: randomUUID(),
    });
    assert(!r.ok);
    expect(r.erro.codigo).toBe('AUTO_LICITACAO_PROIBIDA');
  });
  it('perda de aprovação do produtor bloqueia novas ofertas', async () => {
    const s = await setup();
    await f.connection
      .db!.collection('producers')
      .updateOne(
        { userId: new Types.ObjectId(s.seller.id) },
        { $set: { 'aprovacao.estado': 'rejeitado' }, $inc: { revisaoOperacional: 1 } },
      );
    const r = await bid(s, 0);
    assert(!r.ok);
    expect(r.erro.status).toBe(403);
  });
  it('ofertas antes do início e depois do fim são rejeitadas pelo serviço existente', async () => {
    const s = await setup(2, { iniciaEm: new Date(Date.now() + 60000).toISOString() });
    const early = await bid(s, 0);
    assert(!early.ok);
    expect(early.erro.status).toBe(409);
    await expire(s.body.leilaoId);
    const late = await bid(s, 0);
    assert(!late.ok);
    expect(late.erro.status).toBe(409);
    expect((await dbAuction(s.body.leilaoId))!.sequencia).toBe(0);
  });
  it('dois encerradores só produzem um final coerente e não libertam o lote vencedor', async () => {
    const s = await setup();
    await bid(s, 0);
    const final = nextEvent(s.clients[1]!, 'auction:ended');
    await expire(s.body.leilaoId);
    const other = createAuctionService(f.connection, f.security.secret);
    await Promise.all([
      f.service.advance(new Types.ObjectId(s.body.leilaoId)),
      other.advance(new Types.ObjectId(s.body.leilaoId)),
    ]);
    const ended = await final,
      db = await dbAuction(s.body.leilaoId);
    expect(ended.versao).toBe(db!.versao);
    expect(db!.historico.filter((x: { tipo: string }) => x.tipo === 'terminado')).toHaveLength(1);
    expect(db!.reserva.estado).toBe('afeta_vencedor');
  });
  it('reconexão relê o estado persistido e recupera a oferta original por requestId', async () => {
    const s = await setup(),
      key = randomUUID(),
      first = await bid(s, 0, 30100, key);
    assert(first.ok);
    s.clients[0]!.disconnect();
    await bid(s, 1, 30500);
    s.clients[0]!.auth = { token: s.buyerTokens[0] };
    await connectClient(s.clients[0]!);
    const joined = await command(s.clients[0]!, 'auction:join', s.body);
    assert(joined.ok);
    expect(joined.data.sequencia).toBe(2);
    expect(joined.data.valorAtualCent).toBe(30500);
    const replay = await bid(s, 0, 30100, key);
    assert(replay.ok);
    expect(replay.data.origem).toBe('replay');
    expect(replay.data.licitacao.id).toBe(first.data.licitacao.id);
  });
  it('reconexão descobre leilão terminado durante ausência', async () => {
    const s = await setup();
    s.clients[0]!.disconnect();
    await expire(s.body.leilaoId);
    await f.service.advance(new Types.ObjectId(s.body.leilaoId));
    await connectClient(s.clients[0]!);
    const r = await command(s.clients[0]!, 'auction:join', s.body);
    assert(r.ok);
    expect(r.data.estado).toBe('terminado');
    expect(r.data.resultado?.tipo).toBe('sem_licitacoes');
  });
  it('expiração após handshake desliga a ligação e exige autenticação nova', async () => {
    const s = await f.subject(),
      now = Math.floor(Date.now() / 1000),
      token = await authToken(f.security, s.buyers[0]!.id, { exp: now + 2 });
    const socket = f.client(token);
    await connectClient(socket);
    const e = await nextEvent(socket, 'auction:error', (x) => x.status === 401);
    expect(e.status).toBe(401);
    await vi.waitFor(() => expect(socket.connected).toBe(false));
    socket.auth = { token: await authToken(f.security, s.buyers[0]!.id) };
    await connectClient(socket);
    expect(socket.connected).toBe(true);
  });
  it('long-polling funciona e usa a mesma autorização', async () => {
    const s = await f.subject(),
      a = await f.service.create(s.seller, s.body, randomUUID()),
      socket = f.client(s.buyerTokens[0]!, {
        transports: ['polling'],
        origin: 'http://localhost:5173',
      });
    await connectClient(socket);
    const r = await command(socket, 'auction:join', { leilaoId: a.body.id });
    assert(r.ok);
    expect(r.data.estado).toBe('ativo');
  });
  it.each(['websocket', 'polling'] as const)(
    'CORS bloqueia origem não autorizada em %s',
    async (transport) => {
      const s = await f.subject();
      await expect(
        connectClient(
          f.client(s.buyerTokens[0]!, {
            transports: [transport],
            origin: 'http://nao-permitido.invalid',
          }),
        ),
      ).rejects.toThrow();
    },
  );
  it('JWT em URL é recusado e não substitui auth.token', async () => {
    const s = await f.subject();
    await expect(
      connectClient(f.client(s.buyerTokens[0]!, { query: { token: s.buyerTokens[0]! } })),
    ).rejects.toThrow();
  });
  it('eventos desconhecidos e payload excessivo recebem erros seguros', async () => {
    const s = await setup();
    for (const [event, payload, expected] of [
      ['administracao:salas', {}, 400],
      ['auction:join', { ...s.body, texto: 'x'.repeat(9000) }, 413],
    ] as const) {
      const r = await command(s.clients[0]!, event, payload);
      assert(!r.ok);
      expect(r.erro.status).toBe(expected);
    }
  });
  it('licitação elegível concorre com encerramento e mantém um único resultado confirmado', async () => {
    const s = await setup(2, { terminaEm: new Date(Date.now() + 2500).toISOString() });
    const end = new Date(s.auction.body.terminaEm).getTime(),
      ended = nextEvent(s.clients[1]!, 'auction:ended');
    const original = mongo.Collection.prototype.insertOne;
    const spy = vi
      .spyOn(mongo.Collection.prototype, 'insertOne')
      .mockImplementation(async function (
        this: mongo.Collection,
        ...args: Parameters<typeof original>
      ) {
        if (this.collectionName === 'bids' && String(args[0].leilao) === s.body.leilaoId)
          await new Promise((r) => setTimeout(r, Math.max(1, end - Date.now() + 150)));
        return original.apply(this, args);
      } as typeof original);
    let response;
    try {
      response = await bid(s, 0, 31700);
    } finally {
      spy.mockRestore();
    }
    assert(response.ok);
    const final = await ended,
      db = await dbAuction(s.body.leilaoId);
    expect(final.resultado?.bidId).toBe(response.data.licitacao.id);
    expect(db!.sequencia).toBe(1);
    expect(db!.versao).toBe(2);
    expect(db!.reserva.estado).toBe('afeta_vencedor');
    expect(db!.historico.filter((e: { tipo: string }) => e.tipo === 'terminado')).toHaveLength(1);
  });
  it('perda do acknowledgement após commit é recuperável com a mesma chave após reconexão', async () => {
    const s = await setup(),
      key = randomUUID();
    const unsubscribe = f.service.subscribeCommitted((id) => {
      if (id === s.body.leilaoId) s.clients[0]!.disconnect();
    });
    // O envio pode perder o ack; a prova de sucesso vem exclusivamente do documento MongoDB.
    s.clients[0]!.emit(
      'auction:bid',
      { ...s.body, valorCent: 31700, requestId: key },
      () => undefined,
    );
    try {
      await vi.waitFor(async () => expect((await dbAuction(s.body.leilaoId))!.sequencia).toBe(1));
    } finally {
      unsubscribe();
    }
    await connectClient(s.clients[0]!);
    await command(s.clients[0]!, 'auction:join', s.body);
    const r = await bid(s, 0, 31700, key);
    assert(r.ok);
    expect(r.data.origem).toBe('replay');
    expect((await dbAuction(s.body.leilaoId))!.sequencia).toBe(1);
  });
  it('limite por conta é partilhado por sockets e não reinicia ao reconectar', async () => {
    const g = await realtimeFixture({ limits: { eventsPerAccount: 3 } });
    try {
      const s = await g.subject(),
        a = await g.service.create(s.seller, s.body, randomUUID()),
        body = { leilaoId: a.body.id };
      const one = g.client(s.buyerTokens[0]!),
        two = g.client(s.buyerTokens[0]!);
      await Promise.all([connectClient(one), connectClient(two)]);
      assert((await command(one, 'auction:join', body)).ok);
      assert((await command(two, 'auction:join', body)).ok);
      assert((await command(one, 'auction:state', body)).ok);
      const limited = await command(two, 'auction:state', body);
      assert(!limited.ok);
      expect(limited.erro.status).toBe(429);
      expect(limited.erro.repetirEmSegundos).toBeGreaterThan(0);
      one.disconnect();
      await connectClient(one);
      const again = await command(one, 'auction:join', body);
      assert(!again.ok);
      expect(again.erro.status).toBe(429);
    } finally {
      await g.close();
    }
  });
  it('limite de licitações por conta não é contornado com outro socket', async () => {
    const g = await realtimeFixture({ limits: { bidsPerAccount: 1 } });
    try {
      const s = await g.subject(),
        a = await g.service.create(s.seller, s.body, randomUUID()),
        body = { leilaoId: a.body.id };
      const one = g.client(s.buyerTokens[0]!),
        two = g.client(s.buyerTokens[0]!);
      await Promise.all([connectClient(one), connectClient(two)]);
      await command(one, 'auction:join', body);
      await command(two, 'auction:join', body);
      assert(
        (await command(one, 'auction:bid', { ...body, valorCent: 30100, requestId: randomUUID() }))
          .ok,
      );
      const limited = await command(two, 'auction:bid', {
        ...body,
        valorCent: 30200,
        requestId: randomUUID(),
      });
      assert(!limited.ok);
      expect(limited.erro.status).toBe(429);
    } finally {
      await g.close();
    }
  });
  it('limita ligações concorrentes e liberta os recursos ao desconectar', async () => {
    const g = await realtimeFixture({ limits: { socketsPerAccount: 1 } });
    try {
      const s = await g.subject(),
        one = g.client(s.buyerTokens[0]!);
      await connectClient(one);
      await expect(connectClient(g.client(s.buyerTokens[0]!))).rejects.toMatchObject({
        data: { status: 429 },
      });
      one.disconnect();
      await vi.waitFor(() => expect(g.realtime.activeSockets).toBe(0));
      await connectClient(g.client(s.buyerTokens[0]!));
      expect(g.realtime.activeSockets).toBe(1);
    } finally {
      await g.close();
    }
  });
  it('limita salas por ligação, valida ack e recusa mensagens grandes no Engine.IO', async () => {
    const g = await realtimeFixture({ limits: { roomsPerSocket: 1 } });
    try {
      const s = await g.subject(),
        a = await g.service.create(s.seller, s.body, randomUUID()),
        b = await g.service.create(s.seller, s.body, randomUUID()),
        socket = g.client(s.buyerTokens[0]!);
      await connectClient(socket);
      assert((await command(socket, 'auction:join', { leilaoId: a.body.id })).ok);
      const r = await command(socket, 'auction:join', { leilaoId: b.body.id });
      assert(!r.ok);
      expect(r.erro.status).toBe(429);
      const error = nextEvent(
        socket,
        'auction:bid:rejected',
        (e) => e.erro.codigo === 'EVENTO_INVALIDO',
      );
      (socket as unknown as { emit(name: string, value: object): void }).emit('auction:bid', {
        leilaoId: a.body.id,
        valorCent: 31700,
        requestId: randomUUID(),
      });
      await error;
      (socket as unknown as { emit(name: string, value: object): void }).emit('auction:bid', {
        leilaoId: a.body.id,
        valorCent: 31700,
        requestId: randomUUID(),
        texto: 'x'.repeat(20000),
      });
      await vi.waitFor(() => expect(socket.connected).toBe(false));
      expect(
        (await g.connection
          .db!.collection('auctions')
          .findOne({ _id: new Types.ObjectId(a.body.id) }))!.sequencia,
      ).toBe(0);
    } finally {
      await g.close();
    }
  });
  it('produção recusa ligação HTTP sem terminação TLS confiável', async () => {
    const g = await realtimeFixture({ production: true });
    try {
      const s = await g.subject();
      await expect(connectClient(g.client(s.buyerTokens[0]!))).rejects.toThrow();
    } finally {
      await g.close();
    }
  });
  it('reinício do servidor real recupera fecho e estado, sem reservas duplicadas', async () => {
    const g = await realtimeFixture();
    let runtime: Awaited<ReturnType<typeof startApi>> | undefined;
    try {
      const s = await g.subject(),
        a = await g.service.create(
          s.seller,
          { ...s.body, terminaEm: new Date(Date.now() + 1500).toISOString() },
          randomUUID(),
        );
      const socket = g.client(s.buyerTokens[0]!);
      await connectClient(socket);
      await command(socket, 'auction:join', { leilaoId: a.body.id });
      const accepted = await command<BidAccepted>(socket, 'auction:bid', {
        leilaoId: a.body.id,
        valorCent: 31700,
        requestId: randomUUID(),
      });
      assert(accepted.ok);
      await g.stopNetwork();
      await new Promise((r) =>
        setTimeout(r, Math.max(1, Date.parse(a.body.terminaEm) - Date.now() + 100)),
      );
      runtime = await startApi(
        { ...g.configuration, port: 0 },
        { connect: async () => ({ connection: g.connection, close: async () => undefined }) },
        g.security,
        { enabled: true, syncIntervalMs: 100, authIntervalMs: 100 },
      );
      const address = runtime.server.address();
      assert(address && typeof address !== 'string');
      const { io } = await import('socket.io-client');
      const client = io('http://127.0.0.1:' + address.port + '/auctions', {
        autoConnect: false,
        reconnection: false,
        transports: ['websocket'],
        auth: { token: s.buyerTokens[0] },
      });
      try {
        await connectClient(client);
        const state = await command(client, 'auction:join', { leilaoId: a.body.id });
        assert(state.ok);
        expect(state.data.estado).toBe('terminado');
        expect(state.data.resultado?.bidId).toBe(accepted.data.licitacao.id);
        expect(state.data.versao).toBe(2);
      } finally {
        client.disconnect();
      }
      expect(
        (await g.connection
          .db!.collection('products')
          .findOne({ _id: s.scenario.products[0]!._id }))!.stockDisponivel,
      ).toBe(9500);
    } finally {
      await runtime?.close();
      await g.close();
    }
  });
  it('uma falha de leitura após commit não transforma uma oferta aceite em recusa', async () => {
    const s = await setup(),
      spy = vi.spyOn(f.service, 'snapshot').mockRejectedValue(Error('falha fictícia de leitura'));
    try {
      const r = await bid(s, 0, 31700);
      assert(r.ok);
      expect(r.data.estado.sequencia).toBe(1);
      expect((await dbAuction(s.body.leilaoId))!.sequencia).toBe(1);
    } finally {
      spy.mockRestore();
    }
    const r = await command(s.clients[1]!, 'auction:state', s.body);
    assert(r.ok);
    expect(r.data.valorAtualCent).toBe(31700);
  });
  it('resultado perdido depois do commit é comunicado como incerto e recupera a oferta original', async () => {
    const s = await setup(),
      original = f.service.bid,
      key = randomUUID();
    const spy = vi.spyOn(f.service, 'bid').mockImplementationOnce(async (...args) => {
      await original(...args);
      throw new ApiError(503, 'RESULTADO_DESCONHECIDO', 'Repete o pedido com a mesma chave.');
    });
    const uncertain = nextEvent(s.clients[0]!, 'auction:bid:uncertain');
    try {
      const r = await bid(s, 0, 31700, key);
      assert(!r.ok);
      expect(r.erro.resultadoIncerto).toBe(true);
      expect((await uncertain).requestId).toBe(key);
    } finally {
      spy.mockRestore();
    }
    const replay = await bid(s, 0, 31700, key);
    assert(replay.ok);
    expect(replay.data.origem).toBe('replay');
    expect((await dbAuction(s.body.leilaoId))!.sequencia).toBe(1);
  });
  it('REST e Socket.IO concorrentes não aceitam duas ofertas iguais', async () => {
    const s = await setup();
    const [rest, socket] = await Promise.all([
      request(f.server)
        .post('/api/auctions/' + s.body.leilaoId + '/bids')
        .set('Authorization', 'Bearer ' + s.buyerTokens[0])
        .set('Idempotency-Key', randomUUID())
        .send({ valorCent: 31700 }),
      bid(s, 1, 31700),
    ]);
    expect(Number(rest.status === 201) + Number(socket.ok)).toBe(1);
    expect((await dbAuction(s.body.leilaoId))!.sequencia).toBe(1);
  });
});
