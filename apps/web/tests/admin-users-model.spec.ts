import { test, expect } from '@playwright/test';
import {
  parseUser,
  parseUserDetail,
  parseDashboard,
  parseUsers,
  parseAudits,
  userQuery,
  userSearch,
  reasonError,
  userPageParser,
} from '../src/features/admin-users/contracts';
const row = {
    id: '000000000000000000000701',
    nome: 'Pessoa fictícia',
    email: 'pessoa@example.invalid',
    papeis: ['comprador'],
    ativo: true,
    registadoEm: '2026-10-30T10:00:00Z',
  },
  tag = '"' + 'a'.repeat(43) + '"';
test('projeção administrativa retira dados privados e conserva identidade estável', () => {
  expect(
    parseUser({ ...row, passwordHash: 'privado', token: 'privado', revisaoOperacional: 30 }),
  ).toEqual(row);
});

for (const invalid of [
  { ...row, papeis: ['root'] },
  { ...row, papeis: ['comprador', 'comprador'] },
  { ...row, ativo: 'sim' },
  { ...row, id: 'invalido' },
  { ...row, registadoEm: 'invalido' },
])
  test('rejeita DTO inválido ' + JSON.stringify(invalid), () => {
    expect(() => parseUser(invalid)).toThrow();
  });
test('detalhe exige ETag forte e capacidades coerentes com conta inativa', () => {
  const detail = { ...row, capacidades: { comprar: true, vender: false, administrar: false } };
  expect(parseUserDetail(detail, { etag: tag }).etag).toBe(tag);
  for (const etag of [null, 'W/' + tag, '*'])
    expect(() => parseUserDetail(detail, { etag })).toThrow();
  expect(() => parseUserDetail({ ...detail, ativo: false }, { etag: tag })).toThrow();
});
test('paginação valida contagem dimensão e unicidade', () => {
  const page = { itens: [row], pagina: 1, porPagina: 12, total: 1, totalPaginas: 1 };
  expect(parseUsers(page).itens).toEqual([row]);
  for (const value of [
    { ...page, total: 2 },
    { ...page, pagina: 1001 },
    { ...page, itens: [row, row], total: 2 },
    { ...page, totalPaginas: 2 },
  ])
    expect(() => parseUsers(value)).toThrow();
});
test('resposta de outra query ou filtro não é utilizada', () => {
  const parse = userPageParser('pagina=2&porPagina=12&estado=inativo');
  expect(() =>
    parse({ itens: [row], pagina: 1, porPagina: 12, total: 1, totalPaginas: 1 }),
  ).toThrow();
  expect(() =>
    parse({ itens: [row], pagina: 2, porPagina: 12, total: 13, totalPaginas: 2 }),
  ).toThrow();
});
test('query conserva pesquisa literal e normaliza parâmetros inválidos', () => {
  const q = userQuery(
    new URLSearchParams('pagina=1001&porPagina=100&papel=root&estado=x&pesquisa=Horta'),
  );
  expect(q).toMatchObject({ pagina: 1, porPagina: 12, papel: '', estado: '', pesquisa: 'Horta' });
  expect(
    userQuery(
      new URLSearchParams(userSearch({ ...q, estado: 'ativo', papel: 'produtor', pagina: 2 })),
    ),
  ).toEqual({ ...q, estado: 'ativo', papel: 'produtor', pagina: 2 });
});
test('dashboard exige sete inteiros reais e instante válido', () => {
  const stats = {
    observadoEm: '2026-10-30T10:00:00Z',
    totalUtilizadores: 0,
    compradoresAtivos: 0,
    produtoresAprovados: 0,
    candidaturasPendentes: 0,
    produtosPublicados: 0,
    encomendas: 0,
    leiloesAtivos: 0,
  };
  expect(parseDashboard(stats)).toEqual(stats);
  for (const value of [
    { ...stats, encomendas: -1 },
    { ...stats, leiloesAtivos: undefined },
    { ...stats, compradoresAtivos: 1.5 },
  ])
    expect(() => parseDashboard(value)).toThrow();
});
test('auditoria é paginada e tem autor data motivo e transição verdadeira', () => {
  const event = {
    id: row.id,
    administradorId: row.id,
    ativoAnterior: true,
    ativoAtual: false,
    motivo: 'Fictício',
    ocorridoEm: row.registadoEm,
  };
  expect(
    parseAudits({ itens: [event], pagina: 1, porPagina: 12, total: 1, totalPaginas: 1 }).itens[0],
  ).toEqual(event);
  expect(() =>
    parseAudits({
      itens: [{ ...event, ativoAtual: true }],
      pagina: 1,
      porPagina: 12,
      total: 1,
      totalPaginas: 1,
    }),
  ).toThrow();
});
test('motivo obrigatório normalizado com limite Unicode', () => {
  expect(reasonError(' ')).toBeTruthy();
  expect(reasonError('😀'.repeat(2000))).toBeUndefined();
  expect(reasonError('x'.repeat(2001))).toBeTruthy();
});
