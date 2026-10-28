import { test, expect } from '@playwright/test';
import {
  cents,
  euros,
  nextMinimum,
  mergeSnapshot,
  sampleClock,
  serverTime,
  remainingLabel,
  localSearch,
} from '../src/features/auctions/model';
import {
  parseAuction,
  parseAuctionDetail,
  parseSnapshot,
  parseReceipt,
  parseHistory,
  type AuctionSnapshot,
  type OwnProduct,
} from '../src/features/auctions/contracts';
import { validateAuctionForm } from '../src/features/auctions/form-model';
import {
  accountFingerprint,
  attemptStore,
  type BidAttempt,
} from '../src/features/auctions/attempts';
const id = '123456789012345678901234',
  bidId = '223456789012345678901234';
const start = '2026-10-28T10:00:00.000Z',
  end = '2026-10-28T11:00:00.000Z';
const sale = {
  modalidade: 'peso',
  unidadeBase: 'g',
  quantidadeMinima: 250,
  incrementoCompra: 50,
  quantidadeReferencia: 1000,
};
const snapshot: AuctionSnapshot = {
  leilaoId: id,
  versao: 1,
  sequencia: 0,
  estado: 'ativo',
  valorAtualCent: 1200,
  incrementoCent: 100,
  bidId: null,
  lider: null,
  iniciaEm: start,
  terminaEm: end,
  serverNow: start,
};
const summary = {
  id,
  produtoId: id,
  produtor: { perfilId: id, nome: 'Produção fictícia' },
  titulo: 'Colheita de maçãs',
  descricao: 'Lote fictício',
  lote: { nome: 'Maçãs', quantidade: 500, unidadeVenda: sale },
  precoBaseCent: 1200,
  incrementoCent: 100,
  iniciaEm: start,
  terminaEm: end,
  estado: 'ativo',
  licitacaoAtual: { valorCent: 1200, bidId: null },
  sequencia: 0,
  versao: 1,
  serverNow: start,
};
const product: OwnProduct = {
  id,
  nome: 'Maçãs',
  estadoPublicacao: 'publicado',
  stockDisponivel: 1000,
  unidadeVenda: sale as OwnProduct['unidadeVenda'],
  imagens: [],
};
const fields = {
  title: 'Lote da horta',
  description: 'Colheita fictícia',
  base: '12,00',
  increment: '1,00',
  start: '2026-10-28T10:00',
  end: '2026-10-28T11:00',
  quantity: '500',
};
for (const [input, value] of [
  ['0', 0],
  ['12,01', 1201],
  ['1.5', 150],
  ['90071992547409,91', Number.MAX_SAFE_INTEGER],
] as const)
  test('cêntimos exatos: ' + input, () => expect(cents(input)).toBe(value));
for (const input of ['-1', '1.123', '1e4', 'Infinity', '90071992547409,92', '1 000', ''])
  test('recusa preço inválido ' + input, () => expect(cents(input)).toBeUndefined());
test('incremento não transborda e apresentação preserva cêntimos', () => {
  expect(nextMinimum(Number.MAX_SAFE_INTEGER, 1)).toBeUndefined();
  expect(nextMinimum(1200, 100)).toBe(1300);
  expect(euros(1201)).toBe('12,01');
});
test('relógio usa referência do servidor, RTT e progresso monotónico', () => {
  const c = sampleClock(start, 1000, 800);
  expect(serverTime(c, 2000)).toBe(Date.parse(start) + 1100);
  expect(serverTime(c, 500)).toBe(Date.parse(start) + 100);
  expect(remainingLabel(1001)).toBe('00:00:02');
  expect(remainingLabel(-1)).toBe('00:00:00');
  expect(remainingLabel(86400000)).toBe('1 d 0 h');
});
test('versões antigas nunca substituem uma confirmação recente', () =>
  expect(mergeSnapshot(snapshot, { ...snapshot, versao: 0 }).state).toEqual(snapshot));
test('lacuna de versões pede reconciliação e mantém estado mais recente', () =>
  expect(mergeSnapshot(snapshot, { ...snapshot, versao: 4 })).toMatchObject({
    gap: true,
    invalid: false,
    state: { versao: 4 },
  }));
test('mesma versão aceita hora nova mas recusa conteúdo contraditório', () => {
  expect(mergeSnapshot(snapshot, { ...snapshot, serverNow: end }).invalid).toBe(false);
  for (const change of [
    { valorAtualCent: 1400 },
    { incrementoCent: 200 },
    { terminaEm: '2026-10-29T11:00:00Z' },
    { estado: 'terminado' as const },
  ])
    expect(mergeSnapshot(snapshot, { ...snapshot, ...change }).invalid).toBe(true);
  expect(mergeSnapshot(snapshot, { ...snapshot, leilaoId: bidId }).invalid).toBe(true);
});
test('DTO público projeta apenas dados permitidos e pesquisa só o conjunto recebido', () => {
  const parsed = parseAuction({ ...summary, email: 'privado', passwordHash: 'privado' });
  expect(parsed).not.toHaveProperty('email');
  expect(localSearch([parsed], 'macas ficticia')).toHaveLength(1);
  expect(localSearch([parsed], 'tomate')).toHaveLength(0);
});
test('detalhe e histórico não propagam dados privados extras', () => {
  const d = parseAuctionDetail(
    { ...summary, lider: null, passwordHash: 'privado' },
    { etag: '"etag"' },
  );
  expect(d.etag).toBe('"etag"');
  expect(d).not.toHaveProperty('passwordHash');
  const h = parseHistory({
    itens: [],
    total: 0,
    pagina: 1,
    porPagina: 12,
    totalPaginas: 0,
    sequenciaSnapshot: 0,
    versaoSnapshot: 1,
    serverNow: start,
  });
  expect(h.itens).toEqual([]);
});
test('snapshots rejeitam números inseguros, liderança incompleta e resultado impossível', () => {
  for (const s of [
    { ...snapshot, versao: -1 },
    { ...snapshot, valorAtualCent: Infinity },
    { ...snapshot, bidId },
    { ...snapshot, terminaEm: start },
    { ...snapshot, resultado: { tipo: 'vencedor', valorCent: 1300, bidId: null } },
  ])
    expect(() => parseSnapshot(s)).toThrow();
});
test('recibo exige participante próprio e consistência de leilão', () => {
  const s = {
    ...snapshot,
    versao: 2,
    sequencia: 1,
    bidId,
    lider: { referencia: 'p_abcdefghijklmnopqrstuvwx' },
    valorAtualCent: 1300,
  };
  const r = {
    requestId: 'tentativa-1',
    origem: 'nova',
    licitacao: {
      id: bidId,
      leilaoId: id,
      valorCent: 1300,
      sequencia: 1,
      aceiteEm: start,
      participante: { referencia: s.lider.referencia, proprio: true },
    },
    estado: s,
  };
  expect(parseReceipt(r).requestId).toBe('tentativa-1');
  expect(() =>
    parseReceipt({
      ...r,
      licitacao: { ...r.licitacao, participante: { ...r.licitacao.participante, proprio: false } },
    }),
  ).toThrow();
});
test('formulário aceita lote na grelha e preço base zero', () => {
  expect(validateAuctionForm(fields, product).errors).toEqual({});
  expect(validateAuctionForm({ ...fields, base: '0' }, product).errors).toEqual({});
});
for (const quantity of ['0', '249', '251', '1050', '1.5'])
  test('formulário recusa quantidade ' + quantity, () =>
    expect(validateAuctionForm({ ...fields, quantity }, product).errors.quantity).toBeTruthy(),
  );
test('criação exige produto, título, datas e incremento; edição não altera produto', () => {
  expect(
    validateAuctionForm({ ...fields, title: '', end: fields.start, increment: '0' }).errors,
  ).toMatchObject({
    title: expect.any(String),
    end: expect.any(String),
    increment: expect.any(String),
    product: expect.any(String),
  });
  expect(validateAuctionForm(fields, undefined, true).errors).toEqual({});
});
test('tentativa preserva chave e valor; contas são isoladas e limpeza é condicional', async () => {
  const old = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage');
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, 'sessionStorage', {
    configurable: true,
    value: {
      getItem: (k: string) => values.get(k) ?? null,
      setItem: (k: string, v: string) => values.set(k, v),
      removeItem: (k: string) => values.delete(k),
    },
  });
  try {
    const hash = await accountFingerprint(id),
      a = attemptStore<BidAttempt>(hash, id),
      b = attemptStore<BidAttempt>(await accountFingerprint(bidId), id);
    expect(hash).not.toContain(id);
    const pending = { requestId: 'original', leilaoId: id, valorCent: 1300 };
    expect(a.save(pending)).toBe(true);
    expect(b.read()).toBeUndefined();
    a.clear('outro');
    expect(a.read()).toEqual(pending);
    a.clear('original');
    expect(a.read()).toBeUndefined();
    expect([...values.values()].join()).not.toContain('token');
  } finally {
    if (old) Object.defineProperty(globalThis, 'sessionStorage', old);
    else Reflect.deleteProperty(globalThis, 'sessionStorage');
  }
});
