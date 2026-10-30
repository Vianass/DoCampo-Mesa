import { test, expect } from '@playwright/test';
import {
  parseAdminAuction,
  parseAdminAuctions,
  parseAdminBids,
  auctionQuery,
  auctionSearch,
  toSnapshot,
} from '../src/features/admin-auctions/contracts';
import { mergeSnapshot } from '../src/features/auctions/model';
import { adminAuctionFixture } from './support/admin-auction-fixtures';
test('projeção administrativa conserva pseudónimos e omite campos privados inesperados', () => {
  const a = adminAuctionFixture(1, 'ativo', 1),
    r = parseAdminAuction({ ...a, comprador: 'privado', criacao: { chave: 'privado' } });
  expect(r).not.toHaveProperty('comprador');
  expect(r).not.toHaveProperty('criacao');
  expect(r.lider?.referencia).toMatch(/^p_/);
  expect(r.numeroLicitacoes).toBe(r.sequencia);
});
test('vencedor exige estado terminado, resultado persistido e referência correspondente', () => {
  const a = adminAuctionFixture(1, 'terminado', 1);
  expect(parseAdminAuction(a).vencedor).toEqual(a.lider);
  expect(() => parseAdminAuction({ ...a, estado: 'ativo' })).toThrow();
  expect(() => parseAdminAuction({ ...a, vencedor: { referencia: 'p_diferente' } })).toThrow();
});
test('eventos antigos e duplicados não regressam estado nem inventam oferta', () => {
  const old = toSnapshot(adminAuctionFixture()),
    next = toSnapshot(adminAuctionFixture(1, 'ativo', 2));
  expect(mergeSnapshot(next, old).state.versao).toBe(2);
  expect(mergeSnapshot(next, next).state).toEqual(next);
  const gap = mergeSnapshot(old, next);
  expect(gap.gap).toBe(true);
  expect(gap.state.sequencia).toBe(2);
});
test('indicadores incompatíveis com total filtrado são recusados', () => {
  const a = adminAuctionFixture();
  expect(() =>
    parseAdminAuctions({
      itens: [a],
      pagina: 1,
      porPagina: 12,
      total: 1,
      totalPaginas: 1,
      indicadores: {
        numeroLeiloes: 2,
        numeroLicitacoes: 0,
        porEstado: { agendado: 0, ativo: 1, terminado: 0, cancelado: 0 },
      },
    }),
  ).toThrow();
});
test('histórico valida confirmação sequência e versão', () => {
  const empty = {
    itens: [],
    pagina: 1,
    porPagina: 12,
    total: 0,
    totalPaginas: 0,
    sequenciaSnapshot: 0,
    versaoSnapshot: 0,
    serverNow: new Date().toISOString(),
  };
  expect(parseAdminBids(empty).total).toBe(0);
  expect(() => parseAdminBids({ ...empty, sequenciaSnapshot: 2 })).toThrow();
});
test('query limita páginas mas conserva filtros inválidos para validação backend', () => {
  const q = auctionQuery(
    new URLSearchParams('pagina=1001&produtor=invalid&estado=futuro&desde=2026-10-01'),
  );
  expect(q.pagina).toBe(1);
  expect(new URLSearchParams(auctionSearch(q)).get('produtor')).toBe('invalid');
  expect(q.estado).toBe('futuro');
});
