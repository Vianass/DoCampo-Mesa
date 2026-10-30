import type { Page } from '@playwright/test';
import { mockAccount, accountLogin } from './auth-fixtures';
export const reviewId = '000000000000000000000901',
  reviewOrderId = '000000000000000000000902',
  reviewProductId = '000000000000000000000903',
  reviewProfileId = '000000000000000000000904';
export function reviewFixture() {
  return {
    id: reviewId,
    alvoTipo: 'produto',
    alvoNome: 'Tomates da compra fictícia',
    produtoId: reviewProductId,
    produtorPerfilId: reviewProfileId,
    classificacao: 5,
    comentario: 'Uma boa experiência.',
    criadaEm: '2026-10-30T09:00:00Z',
    autorPublico: 'Comprador verificado · ficticio1234',
    compraVerificada: true,
    encomendaId: reviewOrderId,
    estado: 'publicada',
    versao: 0,
    atualizadaEm: '2026-10-30T09:00:00Z',
    produtorContaId: '000000000000000000000905',
  };
}
export function reviewPage(items: ReturnType<typeof reviewFixture>[]) {
  return {
    itens: items,
    pagina: 1,
    porPagina: 12,
    total: items.length,
    totalPaginas: items.length ? 1 : 0,
    resumo: {
      numeroAvaliacoes: items.length,
      media: items.length ? items.reduce((s, r) => s + r.classificacao, 0) / items.length : null,
      distribuicao: Object.fromEntries(
        [1, 2, 3, 4, 5].map((n) => [n, items.filter((r) => r.classificacao === n).length]),
      ),
    },
  };
}
export async function mockReviews(page: Page, admin = false) {
  const auth = await mockAccount(page);
  auth.roles = admin ? ['administrador'] : ['comprador'];
  const state = {
    items: [] as ReturnType<typeof reviewFixture>[],
    status: 0,
    posts: 0,
    lost: false,
    conflict: false,
  };
  await page.route('**/api/me/review-eligibility**', (route) =>
    route.fulfill({
      json: {
        itens: [
          {
            encomendaId: reviewOrderId,
            estadoEncomenda: 'concluida',
            elegivel: true,
            alvos: [
              {
                alvoTipo: 'produto',
                nome: 'Tomates da compra fictícia',
                produtoId: reviewProductId,
                avaliacaoId: state.items[0]?.id ?? null,
              },
              { alvoTipo: 'produtor', nome: 'Produtor da compra', avaliacaoId: null },
            ],
          },
        ],
        pagina: 1,
        porPagina: 12,
        total: 1,
        totalPaginas: 1,
      },
    }),
  );
  await page.route('**/api/me/reviews**', async (route) => {
    if (state.status) {
      await route.fulfill({ status: state.status, json: { codigo: 'ACESSO_PROIBIDO' } });
      return;
    }
    await route.fulfill({
      json: new URL(route.request().url()).pathname.endsWith('/' + reviewId)
        ? state.items[0]
        : reviewPage(state.items),
    });
  });
  await page.route('**/api/reviews', async (route) => {
    state.posts++;
    state.items = [{ ...reviewFixture(), ...route.request().postDataJSON() }];
    if (state.lost) {
      await route.abort('failed');
      return;
    }
    await route.fulfill({ status: 201, json: state.items[0] });
  });
  await page.route('**/api/admin/reviews**', async (route) => {
    if (state.status) {
      await route.fulfill({ status: state.status, json: { codigo: 'ACESSO_PROIBIDO' } });
      return;
    }
    const path = new URL(route.request().url()).pathname;
    if (route.request().method() === 'PATCH') {
      if (state.conflict) {
        await route.fulfill({ status: 412, json: { codigo: 'PRECONDICAO_FALHOU' } });
        return;
      }
      const data = route.request().postDataJSON();
      state.items[0] = { ...state.items[0]!, estado: data.estado, versao: 1 };
      await route.fulfill({ headers: { ETag: '"' + 'B'.repeat(43) + '"' }, json: state.items[0] });
      return;
    }
    if (path.endsWith('/history')) {
      await route.fulfill({
        json: {
          itens: [],
          pagina: 1,
          porPagina: 12,
          total: 0,
          totalPaginas: 0,
          versaoSnapshot: state.items[0]?.versao ?? 0,
        },
      });
      return;
    }
    if (path.endsWith('/' + reviewId)) {
      await route.fulfill({ headers: { ETag: '"' + 'A'.repeat(43) + '"' }, json: state.items[0] });
      return;
    }
    await route.fulfill({ json: reviewPage(state.items) });
  });
  return { state, auth, login: () => accountLogin(page) };
}
