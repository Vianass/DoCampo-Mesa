import { Types } from 'mongoose';
import { orderReceptionDurationMs } from '../../src/modules/orders/order.constants.js';
import type {
  OrderActor,
  OrderAuditEvent,
  OrderComplaint,
  OrderState,
} from '../../src/modules/orders/order.types.js';

export const orderFixtureDate = new Date('2026-10-22T09:00:00.000Z');
export const orderFixtureBuyer = new Types.ObjectId('000000000000000000000011');
export const orderFixtureProducer = new Types.ObjectId('000000000000000000000012');
export const orderFixtureProduct = new Types.ObjectId('000000000000000000000013');

export function orderEvent(
  id: string,
  para?: string,
  papel: 'comprador' | 'produtor' | 'administrador' = 'comprador',
  minute = 0,
): OrderAuditEvent {
  const ator: OrderActor = {
    tipo: 'utilizador',
    userId: papel === 'produtor' ? orderFixtureProducer : orderFixtureBuyer,
    papelNaAcao: papel,
  };
  return {
    id,
    comandoId: 'comando-' + id,
    tipo: 'acontecimento-ficticio',
    ator,
    ocorridoEm: new Date(orderFixtureDate.getTime() + minute * 60_000),
    versaoObservada: 0,
    ...(para === undefined ? {} : { para }),
  };
}

export function orderPeriod() {
  return {
    inicioEm: new Date('2026-10-23T09:00:00Z'),
    fimEm: new Date('2026-10-23T11:00:00Z'),
    fusoHorario: 'Europe/Lisbon',
  };
}

export function orderComplaintInput(id: string): OrderComplaint {
  return {
    id,
    motivo: 'Motivo fictício',
    descricao: 'Descrição fictícia de teste.',
    estado: 'aberta',
    criadaEm: orderFixtureDate,
    historico: [orderEvent('abertura-' + id, 'aberta') as OrderAuditEvent<'aberta'>],
    intervencoes: [],
  };
}

export function orderInput(
  state: OrderState = 'pendente',
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  const orderId = new Types.ObjectId();
  const unit = {
    modalidade: 'peso',
    unidadeBase: 'g',
    quantidadeReferencia: 1000,
    quantidadeMinima: 250,
    incrementoCompra: 50,
  };
  const chain: OrderState[] =
    state === 'cancelada'
      ? ['pendente', 'confirmada', 'em_preparacao', 'cancelada']
      : (['pendente', 'confirmada', 'em_preparacao', 'pronta', 'concluida'] as OrderState[]).slice(
          0,
          ['pendente', 'confirmada', 'em_preparacao', 'pronta', 'concluida'].indexOf(state) + 1,
        );
  const reception = {
    duracaoMs: orderReceptionDurationMs,
    decorridoMs: 0,
    ultimoInicioEm: null,
    pausadoDesde: null,
    limiteAtualEm: null,
    historico: [] as OrderAuditEvent[],
    ...(state === 'concluida'
      ? {
          entregaDeclaradaEm: orderFixtureDate,
          confirmacaoRececaoEm: new Date('2026-10-22T09:04:00Z'),
          concluidaEm: new Date('2026-10-22T09:04:00Z'),
          modoConclusao: 'comprador',
          historico: [orderEvent('rececao-confirmada', undefined, 'comprador', 4)],
        }
      : {}),
  };
  return {
    _id: orderId,
    operacaoCompraId: 'operacao-' + orderId.toHexString(),
    comprador: orderFixtureBuyer,
    produtor: orderFixtureProducer,
    versao: 0,
    linhas: [
      {
        id: 'linha-001',
        produto: orderFixtureProduct,
        nome: 'Produto fictício',
        quantidade: 500,
        precoReferenciaCent: 150,
        unidadeSnapshot: unit,
        versaoUnidade: 0,
        subtotalCent: 75,
      },
    ],
    subtotalProdutosCent: 75,
    taxaEntregaCent: 0,
    totalCent: 75,
    moeda: 'EUR',
    entrega: {
      snapshot: {
        tipo: 'levantamento',
        periodoInicial: orderPeriod(),
        taxaEntregaCent: 0,
        versaoConfiguracao: 0,
        localLevantamento: 'Local fictício de levantamento',
      },
      acordoAtual: { origem: 'inicial' },
      propostas: [],
    },
    pagamento: {
      metodo: 'dinheiro',
      estado: 'por_pagar',
      historico: [orderEvent('pagamento-inicial', 'por_pagar')],
    },
    estado: state,
    historicoEstado: chain.map((item, index) =>
      orderEvent(
        'estado-' + index,
        item,
        index === 0 || item === 'concluida' ? 'comprador' : 'produtor',
        index,
      ),
    ),
    pedidosCancelamento: [],
    rececao: reception,
    reclamacoes: [],
    ...(state === 'cancelada'
      ? {
          cancelamento: {
            estadoAnterior: 'em_preparacao',
            motivo: 'Cancelamento fictício',
            historico: [orderEvent('cancelamento', undefined, 'produtor', 3)],
            reposicoes: [
              {
                linhaId: 'linha-001',
                produto: orderFixtureProduct,
                unidadeSnapshot: unit,
                versaoUnidade: 0,
                debitada: 500,
                autorizada: 400,
                reposta: 200,
                pendente: 200,
                naoRepor: 100,
                movimentos: [
                  {
                    ...orderEvent('reposicao-001', undefined, 'produtor', 3),
                    quantidade: 200,
                    capacidadeObservada: 200,
                  },
                ],
              },
            ],
          },
        }
      : {}),
    createdAt: orderFixtureDate,
    updatedAt: orderFixtureDate,
    ...overrides,
  };
}

export function homeDelivery() {
  return {
    snapshot: {
      tipo: 'entrega',
      periodoInicial: orderPeriod(),
      taxaEntregaCent: 250,
      versaoConfiguracao: 0,
      concelhoId: 'concelho-ficticio',
      morada: 'Morada fictícia privada',
      contacto: 'Contacto fictício privado',
    },
    acordoAtual: { origem: 'inicial' },
    propostas: [],
  };
}

export function idempotencyInput(orderId: Types.ObjectId, operation: string) {
  return {
    chave: 'chave-ficticia-' + new Types.ObjectId().toHexString(),
    hashCanonico: 'a'.repeat(64),
    encomendas: [orderId],
    resultadoOriginal: {
      operacaoCompraId: operation,
      criadaEm: orderFixtureDate,
      encomendas: [
        { orderId, produtor: orderFixtureProducer, estadoInicial: 'pendente', totalCent: 75 },
      ],
      totalCent: 75,
      moeda: 'EUR',
    },
  };
}
