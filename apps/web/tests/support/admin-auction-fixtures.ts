import type { Page } from '@playwright/test';
import { mockAccount, accountLogin } from './auth-fixtures';
import { auctionStates } from '../../src/features/auctions/contracts';
import type { AdminAuction } from '../../src/features/admin-auctions/contracts';
export const auctionReference = 'p_abcdefghijklmnopqrstuvwx';
export function adminAuctionFixture(
  i = 1,
  state: AdminAuction['estado'] = 'ativo',
  seq = 0,
): AdminAuction {
  const id = (1500 + i).toString(16).padStart(24, '0'),
    bidId = seq ? '223456789012345678901234' : null;
  return {
    id,
    produtoId: '123456789012345678901234',
    produtorContaId: '123456789012345678901235',
    produtor: { perfilId: '123456789012345678901236', nome: 'Horta fictícia' },
    titulo: 'Colheita de teste ' + i,
    descricao: 'Lote fictício para a supervisão.',
    lote: {
      nome: 'Tomates',
      quantidade: 500,
      unidadeVenda: {
        modalidade: 'peso',
        unidadeBase: 'g',
        quantidadeReferencia: 1000,
        quantidadeMinima: 250,
        incrementoCompra: 50,
      },
    },
    precoBaseCent: 1200,
    incrementoCent: 100,
    iniciaEm: new Date(Date.now() - 10000).toISOString(),
    terminaEm: new Date(Date.now() + 3600000).toISOString(),
    estado: state,
    licitacaoAtual: { valorCent: 1200 + seq * 100, bidId },
    sequencia: seq,
    numeroLicitacoes: seq,
    versao: seq + (state === 'terminado' ? 1 : 0),
    serverNow: new Date().toISOString(),
    estadoEmAtualizacao: false,
    lider: seq ? { referencia: auctionReference } : null,
    ...(state === 'terminado'
      ? {
          resultado: {
            tipo: seq ? ('vencedor' as const) : ('sem_licitacoes' as const),
            valorCent: seq ? 1200 + seq * 100 : null,
            bidId,
          },
          ...(seq ? { vencedor: { referencia: auctionReference } } : {}),
        }
      : {}),
  };
}
export async function mockAdminAuctions(page: Page, count = 1) {
  const auth = await mockAccount(page);
  auth.roles = ['administrador'];
  const state = {
    status: 0,
    items: Array.from({ length: count }, (_, i) => adminAuctionFixture(i + 1)),
    queries: [] as string[],
    gate: undefined as Promise<void> | undefined,
  };
  await page.route('**/api/admin/auctions**', async (route) => {
    await state.gate;
    const url = new URL(route.request().url()),
      parts = url.pathname.split('/'),
      id = parts[4];
    state.queries.push(url.search);
    if (state.status) {
      await route.fulfill({
        status: state.status,
        json: { codigo: 'ERRO', mensagem: 'segredo interno' },
      });
      return;
    }
    if (id) {
      const a = state.items.find((a) => a.id === id);
      if (!a) {
        await route.fulfill({
          status: 404,
          json: { codigo: 'LEILAO_NAO_ENCONTRADO', mensagem: 'Indisponível' },
        });
        return;
      }
      if (parts[5] === 'bids') {
        const page = Number(url.searchParams.get('pagina') ?? 1),
          items = Array.from({ length: a.sequencia }, (_, i) => ({
            id: (2000 + i).toString(16).padStart(24, '0'),
            leilaoId: a.id,
            valorCent: 1300 + i * 100,
            sequencia: i + 1,
            aceiteEm: a.serverNow,
            participante: { referencia: auctionReference },
            confirmada: true,
          })).reverse();
        await route.fulfill({
          json: {
            itens: items.slice((page - 1) * 12, page * 12),
            pagina: page,
            porPagina: 12,
            total: items.length,
            totalPaginas: Math.ceil(items.length / 12),
            sequenciaSnapshot: a.sequencia,
            versaoSnapshot: a.versao,
            serverNow: a.serverNow,
          },
        });
        return;
      }
      await route.fulfill({ json: a });
      return;
    }
    const p = Number(url.searchParams.get('pagina') ?? 1),
      per = Number(url.searchParams.get('porPagina') ?? 12),
      items = state.items.filter(
        (a) =>
          (!url.searchParams.get('estado') || a.estado === url.searchParams.get('estado')) &&
          (!url.searchParams.get('identificador') ||
            a.id === url.searchParams.get('identificador')),
      );
    await route.fulfill({
      json: {
        itens: items.slice((p - 1) * per, p * per),
        pagina: p,
        porPagina: per,
        total: items.length,
        totalPaginas: Math.ceil(items.length / per),
        indicadores: {
          numeroLeiloes: items.length,
          porEstado: Object.fromEntries(
            auctionStates.map((s) => [s, items.filter((a) => a.estado === s).length]),
          ),
          numeroLicitacoes: items.reduce((n, a) => n + a.sequencia, 0),
          valorOfertasVencedorasCent: items.reduce(
            (n, a) =>
              n +
              (a.estado === 'terminado' && a.resultado?.tipo === 'vencedor'
                ? (a.resultado.valorCent ?? 0)
                : 0),
            0,
          ),
        },
      },
    });
  });
  return { state, auth, login: () => accountLogin(page) };
}
