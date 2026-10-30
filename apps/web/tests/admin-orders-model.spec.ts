import { test, expect } from '@playwright/test';
import {
  parseAdminOrders,
  parseAdminOrder,
  parseAdminHistory,
  orderQuery,
  orderSearch,
} from '../src/features/admin-orders/contracts';
import { adminPageFixture, adminOrderFixture } from './support/admin-order-fixtures';
test('DTOs minimizados mantêm snapshots e não propagam campos privados inesperados', () => {
  const raw = { ...adminOrderFixture(), passwordHash: 'privado' };
  const r = parseAdminOrder(raw);
  expect(r.order.linhas).toEqual(raw.linhas);
  expect(r.comprador.nomeAtual).toBe('Comprador fictício');
  expect(r).not.toHaveProperty('passwordHash');
  expect(r.entrega).not.toHaveProperty('contacto');
  expect(parseAdminOrders(adminPageFixture()).total).toBe(1);
});
test('indicadores devem coincidir com o conjunto filtrado', () => {
  const raw = adminPageFixture();
  raw.indicadores.numeroEncomendas = 2;
  expect(() => parseAdminOrders(raw)).toThrow();
});
test('histórico valida domínio e não inventa estados ou autor ausentes', () => {
  const h = parseAdminHistory({
    itens: [{ tipo: 'evento', para: 'pago', ocorridoEm: '2026-10-28T10:00:00Z' }],
    dominio: 'pagamento',
    pagina: 1,
    porPagina: 12,
    total: 1,
    totalPaginas: 1,
  });
  expect(h.itens[0]).not.toHaveProperty('de');
  expect(h.itens[0]).not.toHaveProperty('responsavel');
  expect(() => parseAdminHistory({ ...h, dominio: 'operacional' })).toThrow();
});
test('query conserva filtros e limita paginação sem converter filtros inválidos em pesquisa global', () => {
  const q = orderQuery(
    new URLSearchParams(
      'pagina=1001&porPagina=36&estado=inexistente&desde=2026-10-01&comprador=inválido',
    ),
  );
  expect(q.pagina).toBe(1);
  expect(q.estado).toBe('inexistente');
  const p = new URLSearchParams(orderSearch(q));
  expect(p.get('desde')).toBe('2026-10-01');
  expect(p.get('comprador')).toBe('inválido');
});
test('recusa valores monetários inseguros e enum fictício', () => {
  const p = adminPageFixture();
  p.itens[0]!.totalCent = Number.MAX_SAFE_INTEGER + 1;
  expect(() => parseAdminOrders(p)).toThrow();
  expect(() => parseAdminOrder({ ...adminOrderFixture(), estado: 'entregue' })).toThrow();
});
