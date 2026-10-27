import type { Page } from '@playwright/test';
import { orderFixture } from './checkout-fixtures';
import { orderStates } from '../../src/features/checkout/contracts';
export async function mockProducerOrders(page: Page) {
  const state = {
    order: orderFixture(),
    version: 0,
    status: 200,
    total: 1,
    gate: undefined as Promise<void> | undefined,
    calls: [] as { method: string; query: string; match?: string; body?: unknown }[],
  };
  const tag = () => '"' + String(state.version).padStart(43, 'a') + '"';
  const actions = () =>
    ({ pendente: ['confirmada'], confirmada: ['em_preparacao'], em_preparacao: ['pronta'] })[
      state.order.estado
    ] ?? [];
  await page.route(
    (url) => url.pathname.startsWith('/api/me/producer/orders'),
    async (route) => {
      const req = route.request(),
        url = new URL(req.url()),
        method = req.method();
      state.calls.push({
        method,
        query: url.search,
        match: req.headers()['if-match'],
        ...(method === 'PATCH' ? { body: req.postDataJSON() } : {}),
      });
      await state.gate;
      if (state.status !== 200)
        return route.fulfill({
          status: state.status,
          json: {
            codigo: state.status === 412 ? 'PRECONDICAO_FALHOU' : 'SERVICO_INDISPONIVEL',
            mensagem: 'detalhe interno fictício',
          },
        });
      if (method === 'PATCH') {
        if (req.headers()['if-match'] !== tag())
          return route.fulfill({ status: 412, json: { codigo: 'PRECONDICAO_FALHOU' } });
        const target = req.postDataJSON().estado;
        if (!actions().includes(target))
          return route.fulfill({ status: 409, json: { codigo: 'TRANSICAO_INDISPONIVEL' } });
        state.order = {
          ...state.order,
          estado: target,
          historicoEstado: [
            ...state.order.historicoEstado!,
            {
              tipo: 'estado_atualizado_produtor',
              de: state.order.estado,
              para: target,
              ocorridoEm: new Date().toISOString(),
            },
          ],
        };
        state.version++;
      }
      if (url.pathname === '/api/me/producer/orders') {
        const pageNumber = Number(url.searchParams.get('pagina') ?? 1),
          filter = url.searchParams.get('estado'),
          total = filter && filter !== state.order.estado ? 0 : state.total;
        return route.fulfill({
          json: {
            itens: Array.from(
              { length: Math.max(0, Math.min(12, total - (pageNumber - 1) * 12)) },
              (_, i) => ({
                ...state.order,
                id:
                  i === 0 && pageNumber === 1
                    ? state.order.id
                    : String(1000 + (pageNumber - 1) * 12 + i).padStart(24, '0'),
                modalidade: 'levantamento',
              }),
            ),
            pagina: pageNumber,
            porPagina: 12,
            total,
            totalPaginas: Math.ceil(total / 12),
            indicadores: {
              numeroEncomendas: state.total,
              porEstado: Object.fromEntries(
                orderStates.map((s) => [s, s === state.order.estado ? state.total : 0]),
              ),
              valorConcluidasCent:
                state.order.estado === 'concluida' ? state.order.totalCent * state.total : 0,
              estadoVendas: 'concluida',
            },
          },
        });
      }
      return route.fulfill({
        headers: { 'Content-Type': 'application/json', ETag: tag() },
        json: { ...state.order, acoesPermitidas: actions() },
      });
    },
  );
  return state;
}
