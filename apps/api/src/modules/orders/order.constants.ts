export const orderStates = [
  'pendente',
  'confirmada',
  'em_preparacao',
  'pronta',
  'concluida',
  'cancelada',
] as const;

export const orderPaymentStates = ['por_pagar', 'pagamento_comunicado', 'pago'] as const;
export const orderCancellationRequestStates = ['pendente', 'aceite', 'rejeitado'] as const;
export const orderComplaintStates = ['aberta', 'em_analise', 'escalada', 'resolvida'] as const;
export const orderReceptionModalities = ['levantamento', 'entrega'] as const;
export const orderPaymentMethods = ['dinheiro', 'mb_way', 'transferencia_bancaria'] as const;
export const orderPeriodProposalStates = ['pendente', 'aceite', 'rejeitada'] as const;
export const orderCompletionModes = [
  'comprador',
  'automatica',
  'intervencao_administrativa',
] as const;

export const orderCurrency = 'EUR';
export const orderReceptionDurationMs = 604_800_000; // 168 horas, sem contar pausas.
export const minimumOrderLineSubtotalCents = 1;
// Limite de representação de Number, não um teto comercial para encomendas/taxas.
export const maximumOrderMoneyCents = Number.MAX_SAFE_INTEGER;

export const orderValidationCodes = [
  'QUANTIDADE_INVALIDA',
  'UNIDADE_VENDA_INVALIDA',
  'QUANTIDADE_MINIMA',
  'INCREMENTO_INVALIDO',
  'QUANTIDADE_MAXIMA',
  'STOCK_INVALIDO',
  'STOCK_INSUFICIENTE',
  'PRECO_INVALIDO',
  'VALOR_MONETARIO_INVALIDO',
  'SUBTOTAL_INFERIOR_MINIMO',
  'LIMITE_NUMERICO_EXCEDIDO',
  'LINHAS_INVALIDAS',
  'PRODUTO_INVALIDO',
  'VERSAO_INVALIDA',
  'LINHAS_INCOMPATIVEIS',
  'MODALIDADE_RECECAO_INVALIDA',
] as const;
