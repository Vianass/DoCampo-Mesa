import { randomUUID } from 'node:crypto';
import { Types } from 'mongoose';
import type { ValidatedCheckoutInput } from './checkout.contract.js';
import type { OrderAuditEvent, OrderRecord } from './order.types.js';
import { calculateOrderAmounts } from './order.calculations.js';
import { orderReceptionDurationMs } from './order.constants.js';
import {
  identifyCheckout,
  inspectCheckoutGroup,
  prepareCheckoutIdempotency,
} from './checkout.idempotency.js';
import { ConcurrencyError } from '../concurrency/concurrency-error.js';
import type { ProductRecord } from '../products/product.types.js';
import { validateProductStockCandidate } from '../products/product-stock.repository.js';
import { validateProducerGuardCandidate } from '../producers/producer-eligibility.js';
import type { ProducerEligibilityRecord } from '../producers/producer-eligibility.js';

export interface CheckoutExecution {
  readonly operacaoCompraId: string;
  readonly criadaEm: Date;
  readonly encomendas: ReadonlyMap<
    string,
    {
      readonly id: Types.ObjectId;
      readonly estadoEventoId: string;
      readonly pagamentoEventoId: string;
    }
  >;
  readonly linhas: ReadonlyMap<string, string>;
}

/** IDs e instante lógicos criados uma vez, antes de qualquer callback repetível. */
export function createCheckoutExecution(
  input: ValidatedCheckoutInput,
  now: Date,
): CheckoutExecution {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime()))
    throw new Error('Relógio de checkout inválido.');
  return {
    operacaoCompraId: randomUUID(),
    criadaEm: new Date(now.getTime()),
    encomendas: new Map(
      input.pedido.condicoesPorProdutor.map((selection) => [
        selection.produtorContaId,
        {
          id: new Types.ObjectId(),
          estadoEventoId: randomUUID(),
          pagamentoEventoId: randomUUID(),
        },
      ]),
    ),
    linhas: new Map(input.pedido.linhas.map((line) => [line.produtoId, randomUUID()])),
  };
}

export function producerCheckoutSelection(
  selection: ValidatedCheckoutInput['pedido']['condicoesPorProdutor'][number],
) {
  return {
    modalidade: selection.modalidade,
    metodoPagamento: selection.metodoPagamento,
    ...(selection.modalidade === 'entrega' ? { concelhoId: selection.concelhoId } : {}),
    taxaEntregaAceiteCent: selection.taxaEntregaAceiteCent,
    periodo: {
      inicioEm: new Date(selection.periodo.inicioEm),
      fimEm: new Date(selection.periodo.fimEm),
      fusoHorario: selection.periodo.fusoHorario,
    },
  };
}

/** Snapshots construídos apenas depois de comparar as fontes atuais com a oferta aceite. */
export function prepareCheckoutOrders(
  input: ValidatedCheckoutInput,
  products: ReadonlyMap<string, ProductRecord>,
  producers: ReadonlyMap<string, ProducerEligibilityRecord>,
  execution: CheckoutExecution,
) {
  for (const line of input.pedido.linhas) {
    validateProductStockCandidate(products.get(line.produtoId) ?? null, {
      produtoId: new Types.ObjectId(line.produtoId),
      produtorId: new Types.ObjectId(line.produtorContaId),
      revisaoEsperada: line.ofertaAceite.revisaoProdutoObservada,
      quantidade: line.quantidade,
      precoAceiteCent: line.ofertaAceite.precoReferenciaCent,
      unidadeAceite: line.ofertaAceite.unidadeVenda,
    });
  }
  const buyer = new Types.ObjectId(input.contexto.compradorContaId);
  const orders: OrderRecord[] = [];
  for (const selection of input.pedido.condicoesPorProdutor) {
    const producer = producers.get(selection.produtorContaId) ?? null;
    validateProducerGuardCandidate(producer, {
      produtorId: new Types.ObjectId(selection.produtorContaId),
      revisaoEsperada: selection.revisaoProdutorObservada,
      selecao: producerCheckoutSelection(selection),
    });
    if (!producer?.comercial) throw new Error('Preparação de produtor inconsistente.');
    if (selection.modalidade === 'levantamento' && !producer.comercial.localLevantamento)
      throw new ConcurrencyError(
        'CONFIGURACAO_ALTERADA',
        'Local oficial de levantamento indisponível.',
      );
    const group = input.pedido.linhas.filter(
      (line) => line.produtorContaId === selection.produtorContaId,
    );
    const amounts = calculateOrderAmounts({
      linhas: group.map((line) => {
        const product = products.get(line.produtoId)!;
        return {
          produtoId: line.produtoId,
          quantidade: line.quantidade,
          precoReferenciaCent: product.precoCent!,
          unidadeVenda: line.ofertaAceite.unidadeVenda,
          versaoUnidade: line.ofertaAceite.revisaoProdutoObservada,
          stockDisponivel: product.stockDisponivel!,
        };
      }),
      modalidadeRececao: selection.modalidade,
      taxaEntregaCent: selection.modalidade === 'entrega' ? producer.comercial.taxaEntregaCent! : 0,
    });
    const ids = execution.encomendas.get(selection.produtorContaId)!;
    const date = () => new Date(execution.criadaEm.getTime());
    const event = <State extends string>(id: string, para: State): OrderAuditEvent<State> => ({
      id,
      comandoId: execution.operacaoCompraId,
      tipo: 'criacao_compra',
      ator: { tipo: 'utilizador', userId: buyer, papelNaAcao: 'comprador' },
      ocorridoEm: date(),
      versaoObservada: 0,
      para,
    });
    const sharedSnapshot = {
      periodoInicial: producerCheckoutSelection(selection).periodo,
      taxaEntregaCent: amounts.taxaEntregaCent,
      versaoConfiguracao: selection.revisaoProdutorObservada,
    };
    orders.push({
      _id: ids.id,
      operacaoCompraId: execution.operacaoCompraId,
      comprador: buyer,
      produtor: new Types.ObjectId(selection.produtorContaId),
      versao: 0,
      linhas: amounts.linhas.map((line) => ({
        id: execution.linhas.get(line.produtoId)!,
        produto: new Types.ObjectId(line.produtoId),
        nome: products.get(line.produtoId)!.nome,
        quantidade: line.quantidade,
        precoReferenciaCent: line.precoReferenciaCent,
        unidadeSnapshot: line.unidadeSnapshot,
        versaoUnidade: line.versaoUnidade,
        subtotalCent: line.subtotalCent,
      })),
      subtotalProdutosCent: amounts.subtotalProdutosCent,
      taxaEntregaCent: amounts.taxaEntregaCent,
      totalCent: amounts.totalCent,
      moeda: 'EUR',
      entrega: {
        snapshot:
          selection.modalidade === 'entrega'
            ? {
                ...sharedSnapshot,
                tipo: 'entrega',
                concelhoId: selection.concelhoId,
                morada: selection.morada,
                contacto: selection.contacto,
              }
            : {
                ...sharedSnapshot,
                tipo: 'levantamento',
                localLevantamento: producer.comercial.localLevantamento!,
              },
        acordoAtual: { origem: 'inicial' },
        propostas: [],
      },
      pagamento: {
        metodo: selection.metodoPagamento,
        estado: 'por_pagar',
        historico: [event(ids.pagamentoEventoId, 'por_pagar')],
      },
      estado: 'pendente',
      historicoEstado: [event(ids.estadoEventoId, 'pendente')],
      pedidosCancelamento: [],
      reclamacoes: [],
      rececao: {
        duracaoMs: orderReceptionDurationMs,
        decorridoMs: 0,
        ultimoInicioEm: null,
        pausadoDesde: null,
        limiteAtualEm: null,
        historico: [],
      },
      createdAt: date(),
      updatedAt: date(),
    });
  }
  const plan = prepareCheckoutIdempotency(input, orders);
  const ordered = orders
    .sort((a, b) => (a.produtor.toHexString() < b.produtor.toHexString() ? -1 : 1))
    .map((order) =>
      order._id.equals(plan.ancoraOrderId) ? { ...order, idempotencia: plan.idempotencia } : order,
    );
  const replay = inspectCheckoutGroup(ordered[0], ordered, identifyCheckout(input));
  if (replay.tipo !== 'sucesso') throw new Error('Recibo planeado inconsistente.');
  return { orders: ordered, recibo: replay.recibo };
}
