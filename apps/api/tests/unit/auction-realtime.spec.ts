import { createConnection } from 'mongoose';
import type { IncomingMessage } from 'node:http';
import { randomBytes } from 'node:crypto';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { parseRealtimeEnvironment } from '../../src/config/realtime-environment.js';
import { createSocketLimits } from '../../src/realtime/auction.limits.js';
import {
  allowSocketRequest,
  socketPeer,
  safeSocketError,
} from '../../src/realtime/socket.security.js';
import { roomRequest, bidRequest, handshakeAuth } from '../../src/realtime/auction.protocol.js';
import { createAuctionPublication } from '../../src/realtime/auction.publication.js';
import { auctionSnapshot } from '../../src/modules/auctions/auction.snapshot.js';
import { createAuctionRepository } from '../../src/modules/auctions/auction.repository.js';
import type { AuctionService } from '../../src/modules/auctions/auction.service.js';
import type { AuctionSnapshot } from '../../src/modules/auctions/auction.snapshot.js';
import { ApiError } from '../../src/http/api-error.js';
import { authConfiguration } from '../support/auth-fixtures.js';
import { auctionRecord } from '../support/auction-fixtures.js';
const connection = createConnection(),
  repo = createAuctionRepository(connection, randomBytes(32));
afterAll(async () => {
  await connection.close();
});
function request(
  headers: Record<string, string> = {},
  remote = '127.0.0.1',
  url = '/socket.io/?EIO=4&transport=websocket',
) {
  return { headers, url, socket: { remoteAddress: remote } } as IncomingMessage;
}
describe('configuração e fronteira Socket.IO', () => {
  it('configura o transporte sem novas credenciais ou porta HTTP', () => {
    expect(parseRealtimeEnvironment({})).toEqual({
      enabled: true,
      syncIntervalMs: 500,
      authIntervalMs: 1000,
    });
    expect(parseRealtimeEnvironment({ SOCKET_ENABLED: 'false' }).enabled).toBe(false);
  });
  it.each(['0', '-1', '1.5', 'abc', '5001'])('recusa intervalo inválido %s', (v) => {
    expect(() => parseRealtimeEnvironment({ SOCKET_SYNC_INTERVAL_MS: v })).toThrow();
    expect(() => parseRealtimeEnvironment({ SOCKET_AUTH_INTERVAL_MS: v })).toThrow();
  });
  it('recusa flag ambígua', () => {
    expect(() => parseRealtimeEnvironment({ SOCKET_ENABLED: 'yes' })).toThrow();
  });
  it.each([
    { leilaoId: 'sala:livre' },
    { leilaoId: 'a'.repeat(24), room: 'admin' },
    { leilaoId: 'a'.repeat(24), versao: 1 },
    [],
  ])('não aceita nomes de sala internos ou propriedades livres %j', (v) => {
    expect(roomRequest.safeParse(v).success).toBe(false);
  });
  it('envelope encaminha valor ao domínio, sem duplicar os limites monetários', () => {
    expect(
      bidRequest.safeParse({ leilaoId: 'a'.repeat(24), requestId: 'chave', valorCent: -1 }).success,
    ).toBe(true);
    expect(
      bidRequest.safeParse({
        leilaoId: 'a'.repeat(24),
        requestId: 'chave',
        valorCent: 100,
        comprador: 'livre',
      }).success,
    ).toBe(false);
  });
  it.each([
    {},
    { token: '' },
    { token: 'x'.repeat(4097) },
    { token: 'exemplo', papel: 'administrador' },
  ])('valida auth estrito %j', (v) => {
    expect(handshakeAuth.safeParse(v).success).toBe(false);
  });
  it('sanitiza erros inesperados e preserva erros públicos estruturados', () => {
    expect(safeSocketError(Error('detalhe interno fictício'))).toEqual({
      status: 500,
      codigo: 'ERRO_INTERNO',
      mensagem: 'Não foi possível concluir o pedido.',
    });
    expect(
      safeSocketError(new ApiError(400, 'PEDIDO_INVALIDO', 'Verifica o pedido.')),
    ).toMatchObject({ status: 400, codigo: 'PEDIDO_INVALIDO' });
  });
});
describe('limites partilhados e memória limitada', () => {
  it('partilha orçamento de eventos/conta entre IPs e ligações', () => {
    const l = createSocketLimits({ eventsPerAccount: 1 });
    l.event('ip1', 'conta', false);
    expect(() => l.event('ip2', 'conta', false)).toThrow('Demasiados');
  });
  it('mantém orçamento de licitações separado', () => {
    const l = createSocketLimits({ bidsPerAccount: 1 });
    l.event('ip', 'conta', true);
    expect(() => l.event('ip', 'conta', true)).toThrow();
    expect(() => l.event('ip', 'conta', false)).not.toThrow();
  });
  it('libertação idempotente de ligações não apaga o limite de taxa', () => {
    const l = createSocketLimits({ socketsPerAccount: 1, eventsPerAccount: 1 });
    const release = l.acquire('ip', 'conta');
    l.event('ip', 'conta', false);
    expect(() => l.acquire('outro', 'conta')).toThrow();
    release();
    release();
    expect(l.activeSockets).toBe(0);
    const release2 = l.acquire('ip', 'conta');
    expect(() => l.event('ip', 'conta', false)).toThrow();
    release2();
  });
  it('limita IP, total de ligações e entradas sem expulsar limites ativos', () => {
    const byIp = createSocketLimits({ socketsPerIp: 1 });
    const r = byIp.acquire('ip', 'a');
    expect(() => byIp.acquire('ip', 'b')).toThrow();
    r();
    const total = createSocketLimits({ totalSockets: 1 });
    const done = total.acquire('ip1', 'a');
    expect(() => total.acquire('ip2', 'b')).toThrow();
    done();
    const entries = createSocketLimits({ maxEntries: 1 });
    entries.attempt('ip1');
    expect(() => entries.attempt('ip2')).toThrow();
  });
  it('renova a janela apenas após expirar', () => {
    let now = 0;
    const l = createSocketLimits({ connectionAttempts: 1, windowMs: 1000 }, () => now);
    l.attempt('ip');
    expect(() => l.attempt('ip')).toThrow();
    now = 1001;
    expect(() => l.attempt('ip')).not.toThrow();
  });
  it.each([0, -1, 1.1, Infinity])('não aceita configuração de limite %s', (v) => {
    expect(() => createSocketLimits({ eventsPerAccount: v })).toThrow();
  });
});
describe('CORS, TLS e proxy', () => {
  const config = authConfiguration({ allowedOrigins: ['https://permitido.invalid'] });
  it('aceita origem exata e clientes sem Origin; bloqueia outra origem', () => {
    expect(allowSocketRequest(request({ origin: 'https://permitido.invalid' }), config)).toBe(true);
    expect(allowSocketRequest(request(), config)).toBe(true);
    expect(allowSocketRequest(request({ origin: 'https://diferente.invalid' }), config)).toBe(
      false,
    );
  });
  it.each(['token', 'jwt', 'accessToken', 'papel'])('não aceita query alternativa %s', (key) => {
    expect(
      allowSocketRequest(
        request({}, '127.0.0.1', '/socket.io/?EIO=4&transport=websocket&' + key + '=ficticio'),
        config,
      ),
    ).toBe(false);
  });
  it('não autentica por header Authorization', () => {
    expect(allowSocketRequest(request({ authorization: 'Bearer ficticio' }), config)).toBe(false);
  });
  it('ignora X-Forwarded-* de pares não confiáveis', () => {
    const req = request({ 'x-forwarded-for': '198.51.100.1', 'x-forwarded-proto': 'https' });
    expect(socketPeer(req, config)).toEqual({ ip: '127.0.0.1', secure: false });
    expect(allowSocketRequest(req, { ...config, production: true })).toBe(false);
  });
  it('usa apenas a cadeia de proxies confiáveis e normaliza IPv4 mapeado', () => {
    const trusted = { ...config, trustedProxies: ['127.0.0.1'], production: true };
    const req = request(
      { 'x-forwarded-for': '192.0.2.20, 198.51.100.2', 'x-forwarded-proto': 'https' },
      '::ffff:127.0.0.1',
    );
    expect(socketPeer(req, trusted)).toEqual({ ip: '198.51.100.2', secure: true });
    expect(allowSocketRequest(req, trusted)).toBe(true);
  });
});
describe('projeção e publicação de estados', () => {
  it('projeção de sala não contém identificação privada ou dados próprios do produtor', () => {
    const a = auctionRecord();
    a.licitacaoAtual.comprador = a.produtor;
    const value = JSON.stringify(auctionSnapshot(a, new Date(), repo));
    expect(value).not.toContain(a.produtor.toHexString());
    expect(value).not.toMatch(/criacao|requestHash|email|password|reserva|proprio|historico/);
  });
  function publication() {
    const initial = auctionSnapshot(auctionRecord(), new Date(), repo);
    initial.leilaoId = 'a'.repeat(24);
    const snapshot = vi.fn(async () => initial),
      emit = vi.fn(async () => undefined),
      listeners = new Set<(id: string) => void>();
    let present = true;
    const service = {
      snapshot,
      subscribeCommitted: (fn: (id: string) => void) => {
        listeners.add(fn);
        return () => {
          listeners.delete(fn);
        };
      },
    } as unknown as AuctionService;
    const publisher = createAuctionPublication(
      service,
      {
        rooms: () => (present ? [initial.leilaoId] : []),
        hasRoom: () => present,
        emit,
        unavailable: vi.fn(),
      },
      10000,
    );
    return {
      initial,
      snapshot,
      emit,
      listeners,
      publisher,
      remove: () => {
        present = false;
        publisher.forget(initial.leilaoId);
      },
    };
  }
  it('leituras fora de ordem não fazem regredir a versão em cache', async () => {
    const p = publication();
    let release!: (s: AuctionSnapshot) => void;
    p.snapshot.mockImplementationOnce(
      () =>
        new Promise((r) => {
          release = r;
        }),
    );
    const slow = p.publisher.state(p.initial.leilaoId);
    p.snapshot.mockResolvedValueOnce({ ...p.initial, versao: 2 });
    expect((await p.publisher.state(p.initial.leilaoId)).versao).toBe(2);
    release({ ...p.initial, versao: 1 });
    expect((await slow).versao).toBe(2);
    await p.publisher.close();
  });
  it('publica só versões novas; notificações repetidas não produzem finais incompatíveis', async () => {
    const p = publication();
    try {
      p.publisher.notify(p.initial.leilaoId);
      await vi.waitFor(() => expect(p.emit).toHaveBeenCalledTimes(1));
      p.publisher.notify(p.initial.leilaoId);
      await new Promise((r) => setTimeout(r, 10));
      expect(p.emit).toHaveBeenCalledTimes(1);
      p.snapshot.mockResolvedValue({ ...p.initial, versao: 1, estado: 'terminado' });
      p.publisher.notify(p.initial.leilaoId);
      await vi.waitFor(() => expect(p.emit).toHaveBeenCalledTimes(2));
    } finally {
      await p.publisher.close();
    }
  });
  it('limpa listeners e deixa de publicar após fecho', async () => {
    const p = publication();
    expect(p.listeners.size).toBe(1);
    await p.publisher.close();
    expect(p.listeners.size).toBe(0);
    p.publisher.notify(p.initial.leilaoId);
    expect(p.emit).not.toHaveBeenCalled();
  });
  it('não publica para uma sala removida durante a leitura', async () => {
    const p = publication();
    let release!: (s: AuctionSnapshot) => void;
    p.snapshot.mockImplementationOnce(
      () =>
        new Promise((r) => {
          release = r;
        }),
    );
    p.publisher.notify(p.initial.leilaoId);
    await vi.waitFor(() => expect(p.snapshot).toHaveBeenCalledTimes(1));
    p.remove();
    release(p.initial);
    await p.publisher.close();
    expect(p.emit).not.toHaveBeenCalled();
  });
});
