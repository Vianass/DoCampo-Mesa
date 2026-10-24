import type { Types } from 'mongoose';
import type { saleDefinitions } from '../products/product.constants.js';
import type { BaseUnit, SaleModality, SaleUnitRecord } from '../products/product.types.js';
import type { UserRole } from '../users/user.model.js';
import type {
  orderCancellationRequestStates,
  orderComplaintStates,
  orderCompletionModes,
  orderCurrency,
  orderPaymentMethods,
  orderPaymentStates,
  orderPeriodProposalStates,
  orderReceptionDurationMs,
  orderReceptionModalities,
  orderStates,
  orderValidationCodes,
} from './order.constants.js';

export type OrderState = (typeof orderStates)[number];
export type OrderPaymentState = (typeof orderPaymentStates)[number];
export type OrderCancellationRequestState = (typeof orderCancellationRequestStates)[number];
export type OrderComplaintState = (typeof orderComplaintStates)[number];
export type OrderReceptionModality = (typeof orderReceptionModalities)[number];
export type OrderPaymentMethod = (typeof orderPaymentMethods)[number];
export type OrderPeriodProposalState = (typeof orderPeriodProposalStates)[number];
export type OrderCompletionMode = (typeof orderCompletionModes)[number];
export type OrderValidationCode = (typeof orderValidationCodes)[number];

// Uma compra exige a unidade completa; rascunhos de Product continuam opcionais.
export type OrderSaleUnit = {
  [Modality in SaleModality]: {
    readonly modalidade: Modality;
    readonly unidadeBase: (typeof saleDefinitions)[Modality]['unidadeBase'];
    readonly quantidadeReferencia: (typeof saleDefinitions)[Modality]['quantidadeReferencia'];
    readonly quantidadeMinima: number;
    readonly incrementoCompra: number;
    readonly rotulo?: SaleUnitRecord['rotulo'];
  } & (Modality extends 'unidade' | 'embalagem'
    ? { readonly conteudoPorUnidade?: Readonly<{ quantidade: number; unidade: BaseUnit }> }
    : { readonly conteudoPorUnidade?: never });
}[SaleModality];

// Entradas dos cálculos: valores explícitos, sem documentos, sessões ou DTOs HTTP.
export interface OrderLineCalculationInput {
  readonly quantidade: number;
  readonly precoReferenciaCent: number;
  readonly unidadeVenda: OrderSaleUnit;
  readonly stockDisponivel?: number;
}

export interface OrderLineInput extends OrderLineCalculationInput {
  readonly produtoId: string;
  readonly versaoUnidade: number;
}

export interface OrderAmountsInput {
  readonly linhas: readonly OrderLineInput[];
  readonly modalidadeRececao: OrderReceptionModality;
  /** Tarifa configurada para entrega; levantamento aplica sempre zero. */
  readonly taxaEntregaCent: number;
}

// Resultados de cálculo não transportam stock nem dados privados do domínio.
export interface OrderCalculatedLine {
  readonly produtoId: string;
  readonly versaoUnidade: number;
  readonly quantidade: number;
  readonly precoReferenciaCent: number;
  readonly unidadeSnapshot: OrderSaleUnit;
  readonly subtotalCent: number;
}

export interface OrderCalculatedProducts {
  readonly linhas: readonly OrderCalculatedLine[];
  readonly subtotalProdutosCent: number;
}

export interface OrderAmounts extends OrderCalculatedProducts {
  readonly taxaEntregaCent: number;
  readonly totalCent: number;
  readonly moeda: typeof orderCurrency;
}

export interface OrderInvalidField {
  readonly campo: string;
  readonly mensagem: string;
}

// Tipos internos conceptuais; não são schemas persistidos nem respostas públicas.
export type OrderActor =
  | { readonly tipo: 'utilizador'; readonly userId: Types.ObjectId; readonly papelNaAcao: UserRole }
  | { readonly tipo: 'sistema'; readonly identificador: string };

export interface OrderAuditEvent<State extends string = string> {
  readonly id: string;
  readonly comandoId: string;
  readonly tipo: string;
  readonly ator: OrderActor;
  readonly ocorridoEm: Date;
  readonly de?: State;
  readonly para?: State;
  readonly justificacao?: string;
  readonly conteudo?: string;
  readonly versaoObservada: number;
}

export interface OrderPeriod {
  readonly inicioEm: Date;
  readonly fimEm: Date;
  readonly fusoHorario: string;
}

export interface OrderPeriodProposal {
  readonly id: string;
  readonly periodo: OrderPeriod;
  readonly estado: OrderPeriodProposalState;
  readonly historico: readonly OrderAuditEvent<OrderPeriodProposalState>[];
}

export type OrderDeliverySnapshot = {
  readonly periodoInicial: OrderPeriod;
  readonly taxaEntregaCent: number;
  readonly versaoConfiguracao: number;
} & (
  | {
      readonly tipo: 'entrega';
      readonly concelhoId: string;
      readonly morada: string;
      readonly contacto: string;
    }
  | { readonly tipo: 'levantamento'; readonly localLevantamento: string }
);

export interface OrderDelivery {
  readonly snapshot: OrderDeliverySnapshot;
  readonly acordoAtual:
    { readonly origem: 'inicial' } | { readonly origem: 'proposta'; readonly propostaId: string };
  readonly propostas: readonly OrderPeriodProposal[];
}

export interface OrderPayment {
  readonly metodo: OrderPaymentMethod;
  readonly estado: OrderPaymentState;
  readonly historico: readonly OrderAuditEvent<OrderPaymentState>[];
}

export interface OrderCancellationRequest {
  readonly id: string;
  readonly estado: OrderCancellationRequestState;
  readonly motivo: string;
  readonly criadoEm: Date;
  readonly historico: readonly OrderAuditEvent<OrderCancellationRequestState>[];
}

export interface OrderStockMovement extends OrderAuditEvent {
  readonly quantidade: number;
  readonly capacidadeObservada: number;
}

export interface OrderStockRestoration {
  readonly linhaId: string;
  readonly produto: Types.ObjectId;
  readonly unidadeSnapshot: OrderSaleUnit;
  readonly versaoUnidade: number;
  readonly debitada: number;
  readonly autorizada: number;
  readonly reposta: number;
  readonly pendente: number;
  readonly naoRepor: number;
  readonly movimentos: readonly OrderStockMovement[];
}

export interface OrderCancellation {
  readonly estadoAnterior: OrderState;
  readonly pedidoId?: string;
  readonly motivo: string;
  readonly historico: readonly OrderAuditEvent[];
  readonly reposicoes: readonly OrderStockRestoration[];
}

export interface OrderReception {
  readonly duracaoMs: typeof orderReceptionDurationMs;
  readonly decorridoMs: number;
  readonly entregaDeclaradaEm?: Date;
  readonly confirmacaoRececaoEm?: Date;
  readonly ultimoInicioEm: Date | null;
  readonly pausadoDesde: Date | null;
  readonly limiteAtualEm: Date | null;
  readonly concluidaEm?: Date;
  readonly modoConclusao?: OrderCompletionMode;
  readonly motivoConclusao?: string;
  readonly historico: readonly OrderAuditEvent[];
}

export interface OrderComplaint {
  readonly id: string;
  readonly motivo: string;
  readonly descricao: string;
  readonly estado: OrderComplaintState;
  readonly criadaEm: Date;
  readonly historico: readonly OrderAuditEvent<OrderComplaintState>[];
  /** Propostas/intervenções sucessivas preservadas; nenhuma é resolução implícita. */
  readonly intervencoes: readonly OrderAuditEvent<OrderComplaintState>[];
}

export interface OrderLineRecord {
  readonly id: string;
  readonly produto: Types.ObjectId;
  readonly nome: string;
  readonly quantidade: number;
  readonly precoReferenciaCent: number;
  readonly unidadeSnapshot: OrderSaleUnit;
  readonly versaoUnidade: number;
  readonly subtotalCent: number;
}

export interface OrderOriginalReceipt {
  readonly operacaoCompraId: string;
  readonly criadaEm: Date;
  readonly encomendas: readonly {
    readonly orderId: Types.ObjectId;
    readonly produtor: Types.ObjectId;
    readonly estadoInicial: OrderState;
    readonly totalCent: number;
  }[];
  readonly totalCent: number;
  readonly moeda: typeof orderCurrency;
}

/** Apenas na encomenda âncora; nunca propagar para resultados de cálculo/DTOs. */
export interface OrderIdempotency {
  readonly chave: string;
  readonly hashCanonico: string;
  readonly encomendas: readonly Types.ObjectId[];
  readonly resultadoOriginal: OrderOriginalReceipt;
}

export interface OrderRecord {
  readonly _id: Types.ObjectId;
  readonly operacaoCompraId: string;
  readonly comprador: Types.ObjectId;
  readonly produtor: Types.ObjectId;
  readonly versao: number;
  readonly linhas: readonly OrderLineRecord[];
  readonly subtotalProdutosCent: number;
  readonly taxaEntregaCent: number;
  readonly totalCent: number;
  readonly moeda: typeof orderCurrency;
  readonly entrega: OrderDelivery;
  readonly pagamento: OrderPayment;
  readonly estado: OrderState;
  readonly historicoEstado: readonly OrderAuditEvent<OrderState>[];
  readonly pedidosCancelamento: readonly OrderCancellationRequest[];
  readonly cancelamento?: OrderCancellation;
  readonly rececao: OrderReception;
  readonly reclamacoes: readonly OrderComplaint[];
  readonly idempotencia?: OrderIdempotency;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}
