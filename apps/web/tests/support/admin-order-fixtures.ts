import type { Page } from '@playwright/test';
import { mockAccount, accountLogin } from './auth-fixtures';
import { orderFixture } from './checkout-fixtures';
import { orderStates } from '../../src/features/checkout/contracts';
export const orderParticipant = {
  contaId: '000000000000000000000031',
  nomeAtual: 'Origem de teste',
};
export function adminOrderFixture() {
  const o = orderFixture();
  return {
    ...o,
    comprador: { contaId: '000000000000000000000501', nomeAtual: 'Comprador fictício' },
    participanteProdutor: orderParticipant,
    entrega: {
      modalidade: 'levantamento',
      periodoInicial: {
        inicioEm: '2026-10-28T09:00:00Z',
        fimEm: '2026-10-28T11:00:00Z',
        fusoHorario: 'Europe/Lisbon',
      },
      localLevantamento: 'Local inicial fictício',
    },
  };
}
export function adminPageFixture(total = 1) {
  const o = adminOrderFixture();
  return {
    itens: total
      ? [
          {
            id: o.id,
            criadaEm: o.criadaEm,
            comprador: o.comprador,
            produtor: orderParticipant,
            totalCent: o.totalCent,
            moeda: 'EUR',
            estado: o.estado,
            pagamento: o.pagamento,
            modalidade: 'levantamento',
          },
        ]
      : [],
    pagina: 1,
    porPagina: 12,
    total,
    totalPaginas: Math.ceil(total / 12),
    indicadores: {
      numeroEncomendas: total,
      porEstado: Object.fromEntries(orderStates.map((s) => [s, s === o.estado ? total : 0])),
    },
  };
}
export async function mockAdminOrders(page: Page) {
  const auth = await mockAccount(page);
  auth.roles = ['administrador'];
  const state = {
    status: 0,
    empty: false,
    gate: undefined as Promise<void> | undefined,
    queries: [] as string[],
  };
  await page.route('**/api/admin/orders**', async (route) => {
    await state.gate;
    const u = new URL(route.request().url());
    state.queries.push(u.search);
    if (state.status) {
      await route.fulfill({
        status: state.status,
        json: { codigo: 'FALHA', mensagem: 'segredo interno' },
      });
      return;
    }
    if (u.pathname.endsWith('/history')) {
      const domain = u.searchParams.get('dominio') ?? 'operacional';
      await route.fulfill({
        json: {
          itens: [
            {
              tipo: 'compra_criada',
              para: domain === 'operacional' ? 'pendente' : 'por_pagar',
              ocorridoEm: '2026-10-28T09:00:00Z',
            },
          ],
          dominio: domain,
          pagina: 1,
          porPagina: 12,
          total: 1,
          totalPaginas: 1,
        },
      });
      return;
    }
    if (/\/orders\/[^/]+$/.test(u.pathname)) {
      await route.fulfill({ json: adminOrderFixture() });
      return;
    }
    const body = adminPageFixture(state.empty ? 0 : 1);
    body.pagina = Number(u.searchParams.get('pagina') ?? 1);
    if (body.pagina > 1) body.itens = [];
    await route.fulfill({ json: body });
  });
  return { state, auth, login: () => accountLogin(page) };
}
