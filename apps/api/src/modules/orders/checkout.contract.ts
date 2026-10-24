import type { orderCurrency } from './order.constants.js';
import type {
  OrderPaymentMethod,
  OrderReceptionModality,
  OrderSaleUnit,
  OrderState,
} from './order.types.js';

export interface CheckoutContext {
  readonly compradorContaId: string;
}

export interface CheckoutAcceptedOffer {
  readonly precoReferenciaCent: number;
  readonly unidadeVenda: OrderSaleUnit;
  readonly revisaoProdutoObservada: number;
}

export interface CheckoutLine {
  readonly produtoId: string;
  /** Associação declarada; a propriedade real só poderá ser verificada na persistência. */
  readonly produtorContaId: string;
  readonly quantidade: number;
  readonly ofertaAceite: CheckoutAcceptedOffer;
}

export interface CheckoutPeriod {
  readonly inicioEm: string;
  readonly fimEm: string;
  readonly fusoHorario: string;
}

interface CheckoutProducerSelection {
  readonly produtorContaId: string;
  readonly periodo: CheckoutPeriod;
  readonly metodoPagamento: OrderPaymentMethod;
  readonly taxaEntregaAceiteCent: number;
  readonly revisaoProdutorObservada: number;
}

export type CheckoutProducerConditions = CheckoutProducerSelection &
  (
    | { readonly modalidade: 'levantamento' }
    | {
        readonly modalidade: 'entrega';
        readonly concelhoId: string;
        readonly morada: string;
        readonly contacto: string;
      }
  );

export interface CheckoutRequest {
  readonly linhas: readonly CheckoutLine[];
  readonly condicoesPorProdutor: readonly CheckoutProducerConditions[];
}

export interface ValidatedCheckoutInput {
  readonly contexto: CheckoutContext;
  readonly chaveIdempotencia: string;
  readonly pedido: CheckoutRequest;
}

/** Orçamentos técnicos locais configuráveis pelo chamador interno, nunca pelo pedido. */
export interface CheckoutTechnicalLimits {
  readonly maxLinhas: number;
  readonly maxProdutos: number;
  readonly maxProdutores: number;
  readonly maxTexto: number;
  readonly maxPedidoBytes: number;
  readonly maxCanonicoBytes: number;
}

export const checkoutTechnicalLimits: Readonly<CheckoutTechnicalLimits> = Object.freeze({
  maxLinhas: 1000,
  maxProdutos: 100,
  maxProdutores: 10,
  maxTexto: 4096,
  maxPedidoBytes: 100 * 1024,
  maxCanonicoBytes: 100 * 1024,
});

export const checkoutCanonicalVersion = 'docampo.checkout.v1';

export type CheckoutValidationCode =
  | 'PEDIDO_INVALIDO'
  | 'QUANTIDADE_INVALIDA'
  | 'OFERTA_INCOERENTE'
  | 'CONDICOES_PRODUTOR_INCOERENTES'
  | 'SELECAO_COMERCIAL_INVALIDA'
  | 'LIMITE_TECNICO_EXCEDIDO';

export type CheckoutErrorCode =
  | CheckoutValidationCode
  | 'RECONFIRMACAO_NECESSARIA'
  | 'CONFLITO_REVISAO'
  | 'CONFLITO_IDEMPOTENCIA';

export interface CheckoutInvalidField {
  readonly campo: string;
  readonly mensagem: string;
}

export class CheckoutValidationError extends Error {
  readonly campos: readonly CheckoutInvalidField[];

  constructor(
    readonly codigo: CheckoutValidationCode,
    campo: string,
    mensagem: string,
  ) {
    super(mensagem);
    this.name = 'CheckoutValidationError';
    this.campos = Object.freeze([Object.freeze({ campo, mensagem })]);
  }
}

export interface CheckoutReceipt {
  readonly operacaoCompraId: string;
  readonly criadaEm: string;
  readonly encomendas: readonly {
    readonly orderId: string;
    readonly produtorContaId: string;
    readonly estadoInicial: Extract<OrderState, 'pendente'>;
    readonly totalCent: number;
  }[];
  readonly totalCent: number;
  readonly moeda: typeof orderCurrency;
}

export interface CheckoutConflict {
  readonly codigo: CheckoutErrorCode;
  readonly campos: readonly CheckoutInvalidField[];
}

/** Apenas representação futura: não cria recibos, replays ou estados persistidos. */
export type CheckoutResult =
  | {
      readonly tipo: 'sucesso';
      readonly origem: 'nova' | 'replay';
      readonly recibo: CheckoutReceipt;
    }
  | { readonly tipo: 'reconfirmacao_necessaria'; readonly conflitos: readonly CheckoutConflict[] }
  | { readonly tipo: 'recusado'; readonly erro: CheckoutConflict }
  | {
      readonly tipo: 'resultado_indeterminado';
      readonly codigo: 'RESULTADO_DESCONHECIDO';
      readonly repetirComMesmaChave: true;
    };

export type CheckoutModality = OrderReceptionModality;
