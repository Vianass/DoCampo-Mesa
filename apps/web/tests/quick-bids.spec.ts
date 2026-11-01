import { test, expect } from '@playwright/test';
import { quickBidValue, quickBidIncrements } from '../src/features/auctions/quick-bids';
import { cents, euros, mergeSnapshot } from '../src/features/auctions/model';
import { formatPrice } from '../src/data/market';

for (const [delta, expected] of [
  [500, 1701],
  [1000, 2201],
  [2500, 3701],
] as const)
  test('atalho exato sobre valor confirmado: +' + delta / 100 + ' €', () => {
    const result = quickBidValue(1201, 100, delta);
    expect(result).toBe(expected);
    expect(cents(euros(result!))).toBe(expected);
    expect(quickBidValue(1201, delta, delta)).toBe(expected);
  });
test('incremento mínimo torna o atalho indisponível; não arredonda nem inventa outro aumento', () => {
  expect(quickBidValue(1200, 501, 500)).toBeUndefined();
  expect(quickBidValue(1200, 1001, 1000)).toBeUndefined();
  expect(quickBidValue(1200, 2501, 2500)).toBeUndefined();
});
for (const delta of quickBidIncrements)
  test('limite seguro do atalho +' + delta / 100, () => {
    expect(quickBidValue(Number.MAX_SAFE_INTEGER - delta, 1, delta)).toBe(Number.MAX_SAFE_INTEGER);
    expect(quickBidValue(Number.MAX_SAFE_INTEGER - delta + 1, 1, delta)).toBeUndefined();
  });
for (const value of [-1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])
  test('recusa valor confirmado malformado: ' + value, () => {
    expect(quickBidValue(value, 100, 500)).toBeUndefined();
    expect(quickBidValue(1200, value, 500)).toBeUndefined();
  });
test('valor apresentado preserva cêntimos no teto e formatos normais/negativos', () => {
  expect(formatPrice(Number.MAX_SAFE_INTEGER)).toMatch(/,91\s*€$/);
  expect(formatPrice(Number.MAX_SAFE_INTEGER - 1)).toMatch(/,90\s*€$/);
  for (const v of [0, 1, 99, 100, 1201, 1000000, -1, -101])
    expect(formatPrice(v)).toBe(
      new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(v / 100),
    );
});
test('eventos repetidos ou antigos não fazem recuar a base confirmada dos atalhos', () => {
  const initial = {
    leilaoId: '123456789012345678901234',
    versao: 3,
    sequencia: 2,
    estado: 'ativo' as const,
    valorAtualCent: 1700,
    incrementoCent: 100,
    bidId: '223456789012345678901234',
    lider: null,
    iniciaEm: '2026-10-31T10:00:00Z',
    terminaEm: '2026-10-31T12:00:00Z',
    serverNow: '2026-10-31T11:00:00Z',
  };
  const duplicate = mergeSnapshot(initial, { ...initial });
  const older = mergeSnapshot(duplicate.state, {
    ...initial,
    versao: 2,
    sequencia: 1,
    valorAtualCent: 1300,
  });
  expect(quickBidValue(older.state.valorAtualCent, older.state.incrementoCent, 500)).toBe(2200);
  expect(mergeSnapshot(initial, { ...initial, valorAtualCent: 9999 }).invalid).toBe(true);
});
