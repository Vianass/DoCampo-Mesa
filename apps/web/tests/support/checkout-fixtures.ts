import type { Page } from '@playwright/test';
import type {
  CheckoutRequest,
  Preparation,
  Receipt,
  OwnOrder,
} from '../../src/features/checkout/contracts';
import { productFixture } from './catalog-fixtures';
import { fixtureToken } from './auth-fixtures';
export const checkoutProduct = productFixture('tomate-coracao');
export const checkoutAccount = '000000000000000000000031';
export const checkoutOrderId = '000000000000000000000801';
export const checkoutOperation = '12345678-1234-4234-8234-123456789abc';
export function preparationFixture(): Preparation {
  return {
    linhas: [
      {
        produtoId: checkoutProduct.id,
        produtorContaId: checkoutAccount,
        nome: checkoutProduct.nome,
        quantidade: 1,
        stockDisponivel: 100,
        subtotalCent: checkoutProduct.precoCent,
        ofertaAceite: {
          precoReferenciaCent: checkoutProduct.precoCent,
          unidadeVenda: checkoutProduct.unidadeVenda,
          revisaoProdutoObservada: 0,
        },
      },
    ],
    produtores: [
      {
        produtorContaId: checkoutAccount,
        perfilId: checkoutProduct.produtor.id,
        nome: 'Origem de teste',
        revisaoProdutorObservada: 0,
        comercial: {
          modalidades: { levantamento: true, entrega: true },
          localLevantamento: 'Local declarado fictício',
          taxaEntregaCent: 250,
          concelhosEntregaIds: ['concelho-ficticio'],
          metodosPagamento: ['dinheiro', 'mb_way'],
          disponibilidade: {
            fusoHorario: 'Europe/Lisbon',
            levantamento: [{ diaSemana: 1, inicio: '09:00', fim: '12:00' }],
            entrega: [{ diaSemana: 1, inicio: '14:00', fim: '18:00' }],
          },
        },
      },
    ],
    moeda: 'EUR',
  };
}
export function receiptFixture(origem: 'nova' | 'replay' = 'nova'): Receipt {
  return {
    operacaoCompraId: checkoutOperation,
    criadaEm: '2026-10-27T10:00:00.000Z',
    encomendas: [
      {
        orderId: checkoutOrderId,
        produtorContaId: checkoutAccount,
        estadoInicial: 'pendente',
        totalCent: checkoutProduct.precoCent,
      },
    ],
    totalCent: checkoutProduct.precoCent,
    moeda: 'EUR',
    origem,
  };
}
export function orderFixture(): OwnOrder {
  return {
    id: checkoutOrderId,
    operacaoCompraId: checkoutOperation,
    produtorContaId: checkoutAccount,
    produtor: { perfilId: checkoutProduct.produtor.id, nomePublico: 'Origem de teste' },
    estado: 'pendente',
    linhas: [
      {
        id: 'linha-ficticia',
        produtoId: checkoutProduct.id,
        nome: checkoutProduct.nome,
        quantidade: 1,
        precoReferenciaCent: checkoutProduct.precoCent,
        unidadeVenda: checkoutProduct.unidadeVenda,
        subtotalCent: checkoutProduct.precoCent,
      },
    ],
    subtotalProdutosCent: checkoutProduct.precoCent,
    taxaEntregaCent: 0,
    totalCent: checkoutProduct.precoCent,
    moeda: 'EUR',
    pagamento: { metodo: 'dinheiro', estado: 'por_pagar' },
    criadaEm: '2026-10-27T10:00:00.000Z',
    atualizadaEm: '2026-10-27T10:00:00.000Z',
    entrega: {
      modalidade: 'levantamento',
      localLevantamento: 'Local declarado fictício',
      periodoInicial: {
        inicioEm: '2026-11-02T09:00:00.000Z',
        fimEm: '2026-11-02T12:00:00.000Z',
        fusoHorario: 'Europe/Lisbon',
      },
      taxaEntregaCent: 0,
    },
    historicoEstado: [
      { tipo: 'criacao_compra', para: 'pendente', ocorridoEm: '2026-10-27T10:00:00.000Z' },
    ],
  };
}
export async function mockCheckout(page: Page) {
  const state = {
    preparation: preparationFixture(),
    prepareStatus: 200,
    postStatus: 201,
    postCode: 'RESULTADO_DESCONHECIDO',
    ordersStatus: 200,
    orders: [orderFixture()],
    recoverStatus: 200,
    networkFailure: false,
    invalidReceipt: false,
    calls: [] as {
      path: string;
      key: string | undefined;
      body: unknown;
      authorization: string | undefined;
    }[],
    attempts: new Map<string, { key: string; pedido: CheckoutRequest; expiraEm: string }>(),
    gate: undefined as Promise<void> | undefined,
  };
  await page.route(
    (url) => url.pathname.startsWith('/api/orders'),
    async (route) => {
      const req = route.request(),
        path = new URL(req.url()).pathname;
      const key = req.headers()['idempotency-key'];
      if (req.headers().authorization !== 'Bearer ' + fixtureToken) {
        await route.fulfill({ status: 401, json: { codigo: 'AUTENTICACAO_INVALIDA' } });
        return;
      }
      if (req.method() === 'POST')
        state.calls.push({
          path,
          key,
          body: req.postDataJSON(),
          authorization: req.headers().authorization,
        });
      if (path === '/api/orders/prepare') {
        await route.fulfill({
          status: state.prepareStatus,
          json:
            state.prepareStatus === 200
              ? state.preparation
              : { codigo: 'SERVICO_INDISPONIVEL', mensagem: 'Mensagem interna não apresentar' },
        });
        return;
      }
      if (path === '/api/orders/attempts') {
        const body = req.postDataJSON();
        const expiraEm = new Date(Date.now() + 86400000).toISOString();
        state.attempts.set(body.referencia, { key: key!, pedido: body.pedido, expiraEm });
        await route.fulfill({ json: { referencia: body.referencia, expiraEm } });
        return;
      }
      if (path.startsWith('/api/orders/attempts/')) {
        const reference = path.split('/').at(-1)!,
          record = state.attempts.get(reference);
        await route.fulfill({
          status: record ? state.recoverStatus : 404,
          json:
            record && state.recoverStatus === 200
              ? {
                  referencia: reference,
                  chaveIdempotencia: record.key,
                  pedido: record.pedido,
                  expiraEm: record.expiraEm,
                }
              : { codigo: 'TENTATIVA_NAO_ENCONTRADA' },
        });
        return;
      }
      if (req.method() === 'POST' && path === '/api/orders') {
        await state.gate;
        if (state.networkFailure) {
          await route.abort('failed');
          return;
        }
        await route.fulfill({
          status: state.postStatus,
          json:
            state.postStatus === 201 || state.postStatus === 200
              ? state.invalidReceipt
                ? { ...receiptFixture(), totalCent: 999999 }
                : receiptFixture(state.postStatus === 201 ? 'nova' : 'replay')
              : {
                  codigo: state.postCode,
                  repetirComMesmaChave: state.postStatus === 503,
                  mensagem: 'Mensagem interna não apresentar',
                },
        });
        return;
      }
      if (state.ordersStatus !== 200) {
        await route.fulfill({
          status: state.ordersStatus,
          json: { codigo: 'SERVICO_INDISPONIVEL' },
        });
        return;
      }
      if (path === '/api/orders') {
        const params = new URL(req.url()).searchParams,
          page = Number(params.get('pagina') ?? 1),
          size = 12;
        const sorted = [...state.orders].sort((a, b) => a.criadaEm.localeCompare(b.criadaEm));
        if (params.get('ordem') !== 'antigas') sorted.reverse();
        await route.fulfill({
          json: {
            itens: sorted.slice((page - 1) * size, page * size),
            pagina: page,
            porPagina: size,
            total: sorted.length,
            totalPaginas: Math.ceil(sorted.length / size),
          },
        });
        return;
      }
      await route.fulfill({
        status: path === '/api/orders/' + checkoutOrderId ? 200 : 404,
        json:
          path === '/api/orders/' + checkoutOrderId
            ? orderFixture()
            : { codigo: 'ENCOMENDA_NAO_ENCONTRADA' },
      });
    },
  );
  return state;
}
