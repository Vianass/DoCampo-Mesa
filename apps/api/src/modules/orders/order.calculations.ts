import {
  maximumProductPriceCents,
  minimumProductPriceCents,
  saleDefinitions,
  saleModalities,
} from '../products/product.constants.js';
import type { SaleModality } from '../products/product.types.js';
import {
  maximumOrderMoneyCents,
  minimumOrderLineSubtotalCents,
  orderCurrency,
  orderReceptionModalities,
} from './order.constants.js';
import type {
  OrderAmounts,
  OrderAmountsInput,
  OrderCalculatedProducts,
  OrderInvalidField,
  OrderLineCalculationInput,
  OrderLineInput,
  OrderReceptionModality,
  OrderSaleUnit,
  OrderValidationCode,
} from './order.types.js';

// Mesmo vocabulário codigo/campos de ApiError, sem acoplar domínio a HTTP/status.
export class OrderValidationError extends Error {
  readonly campos: readonly OrderInvalidField[];

  constructor(
    readonly codigo: OrderValidationCode,
    campo: string,
    mensagem: string,
  ) {
    super(mensagem);
    this.name = 'OrderValidationError';
    this.campos = [{ campo, mensagem }];
  }
}

function invalid(codigo: OrderValidationCode, campo: string, mensagem: string): never {
  throw new OrderValidationError(codigo, campo, mensagem);
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function safeInteger(value: unknown, minimum: number): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum;
}

function supportedModality(value: unknown): value is SaleModality {
  return saleModalities.some((modality) => modality === value);
}

function safeMoney(value: bigint, campo: string): number {
  if (value < 0n || value > BigInt(maximumOrderMoneyCents)) {
    invalid('LIMITE_NUMERICO_EXCEDIDO', campo, 'O valor excede a representação inteira segura.');
  }
  return Number(value);
}

export function validateOrderQuantity(value: unknown): asserts value is number {
  if (!safeInteger(value, 1)) {
    invalid(
      'QUANTIDADE_INVALIDA',
      'quantidade',
      'A quantidade deve ser um inteiro positivo seguro.',
    );
  }
}

export function validateOrderPrice(value: unknown): asserts value is number {
  if (!safeInteger(value, minimumProductPriceCents) || value > maximumProductPriceCents) {
    invalid(
      'PRECO_INVALIDO',
      'precoReferenciaCent',
      'Preço fora dos limites aprovados de products.',
    );
  }
}

export function validateOrderMoney(value: unknown, campo = 'valorCent'): asserts value is number {
  if (!safeInteger(value, 0)) {
    invalid(
      'VALOR_MONETARIO_INVALIDO',
      campo,
      'É necessário um valor inteiro seguro não negativo.',
    );
  }
}

export function validateOrderSaleUnit(value: unknown): asserts value is OrderSaleUnit {
  if (!record(value) || !supportedModality(value.modalidade)) {
    invalid('UNIDADE_VENDA_INVALIDA', 'unidadeVenda', 'Modalidade comercial não suportada.');
  }
  const definition = saleDefinitions[value.modalidade];
  if (
    value.unidadeBase !== definition.unidadeBase ||
    value.quantidadeReferencia !== definition.quantidadeReferencia ||
    !safeInteger(value.quantidadeMinima, 1) ||
    !safeInteger(value.incrementoCompra, 1) ||
    (value.rotulo !== undefined &&
      (typeof value.rotulo !== 'string' || value.rotulo.trim().length === 0))
  ) {
    invalid(
      'UNIDADE_VENDA_INVALIDA',
      'unidadeVenda',
      'Unidade comercial incompleta ou incompatível.',
    );
  }
  const content = value.conteudoPorUnidade;
  if (
    content !== undefined &&
    (value.modalidade === 'peso' ||
      value.modalidade === 'volume' ||
      !record(content) ||
      !safeInteger(content.quantidade, 1) ||
      (content.unidade !== 'g' && content.unidade !== 'ml' && content.unidade !== 'un'))
  ) {
    invalid(
      'UNIDADE_VENDA_INVALIDA',
      'unidadeVenda.conteudoPorUnidade',
      'Conteúdo comercial inválido.',
    );
  }
}

function validateStock(stock: unknown, unit: OrderSaleUnit): asserts stock is number {
  if (!safeInteger(stock, 0) || stock > saleDefinitions[unit.modalidade].stockMaximo) {
    invalid('STOCK_INVALIDO', 'stockDisponivel', 'Stock fora dos limites aprovados da modalidade.');
  }
}

export function validateOrderLineQuantity(
  quantidade: unknown,
  unidadeVenda: unknown,
  stockDisponivel?: unknown,
): void {
  validateOrderQuantity(quantidade);
  validateOrderSaleUnit(unidadeVenda);
  if (quantidade > saleDefinitions[unidadeVenda.modalidade].stockMaximo) {
    invalid('QUANTIDADE_MAXIMA', 'quantidade', 'Quantidade superior ao máximo da modalidade.');
  }
  if (quantidade < unidadeVenda.quantidadeMinima) {
    invalid('QUANTIDADE_MINIMA', 'quantidade', 'Quantidade inferior ao mínimo do produto.');
  }
  // A grelha começa no mínimo aprovado; não impõe múltiplos a partir de zero.
  if (
    (BigInt(quantidade) - BigInt(unidadeVenda.quantidadeMinima)) %
      BigInt(unidadeVenda.incrementoCompra) !==
    0n
  ) {
    invalid(
      'INCREMENTO_INVALIDO',
      'quantidade',
      'Quantidade incompatível com o incremento do produto.',
    );
  }
  if (stockDisponivel !== undefined) {
    validateStock(stockDisponivel, unidadeVenda);
    if (quantidade > stockDisponivel) {
      invalid('STOCK_INSUFICIENTE', 'quantidade', 'A quantidade excede o stock indicado.');
    }
  }
}

export function calculateOrderLineSubtotal(input: OrderLineCalculationInput): number {
  if (!record(input)) invalid('LINHAS_INVALIDAS', 'linha', 'É necessária uma linha comercial.');
  validateOrderPrice(input.precoReferenciaCent);
  validateOrderLineQuantity(input.quantidade, input.unidadeVenda, input.stockDisponivel);
  const numerator = BigInt(input.quantidade) * BigInt(input.precoReferenciaCent);
  const denominator = BigInt(input.unidadeVenda.quantidadeReferencia);
  // Half-up exato, incluindo produtos intermédios maiores que MAX_SAFE_INTEGER.
  const rounded =
    numerator / denominator + ((numerator % denominator) * 2n >= denominator ? 1n : 0n);
  if (rounded < BigInt(minimumOrderLineSubtotalCents)) {
    invalid(
      'SUBTOTAL_INFERIOR_MINIMO',
      'subtotalCent',
      'O subtotal arredondado é inferior a um cêntimo.',
    );
  }
  return safeMoney(rounded, 'subtotalCent');
}

function copyUnit(unit: OrderSaleUnit): OrderSaleUnit {
  const common = {
    quantidadeMinima: unit.quantidadeMinima,
    incrementoCompra: unit.incrementoCompra,
    ...(unit.rotulo === undefined ? {} : { rotulo: unit.rotulo }),
  };
  if (unit.modalidade === 'peso') {
    return {
      modalidade: unit.modalidade,
      unidadeBase: unit.unidadeBase,
      quantidadeReferencia: unit.quantidadeReferencia,
      ...common,
    };
  }
  if (unit.modalidade === 'volume') {
    return {
      modalidade: unit.modalidade,
      unidadeBase: unit.unidadeBase,
      quantidadeReferencia: unit.quantidadeReferencia,
      ...common,
    };
  }
  return {
    modalidade: unit.modalidade,
    unidadeBase: unit.unidadeBase,
    quantidadeReferencia: unit.quantidadeReferencia,
    ...common,
    ...(unit.conteudoPorUnidade === undefined
      ? {}
      : {
          conteudoPorUnidade: {
            quantidade: unit.conteudoPorUnidade.quantidade,
            unidade: unit.conteudoPorUnidade.unidade,
          },
        }),
  };
}

function compatibleUnits(a: OrderSaleUnit, b: OrderSaleUnit): boolean {
  return (
    a.modalidade === b.modalidade &&
    a.unidadeBase === b.unidadeBase &&
    a.quantidadeReferencia === b.quantidadeReferencia &&
    a.quantidadeMinima === b.quantidadeMinima &&
    a.incrementoCompra === b.incrementoCompra &&
    a.rotulo === b.rotulo &&
    a.conteudoPorUnidade?.quantidade === b.conteudoPorUnidade?.quantidade &&
    a.conteudoPorUnidade?.unidade === b.conteudoPorUnidade?.unidade
  );
}

export function aggregateOrderLines(inputs: readonly OrderLineInput[]): readonly OrderLineInput[] {
  if (!Array.isArray(inputs) || inputs.length === 0) {
    invalid('LINHAS_INVALIDAS', 'linhas', 'É necessária uma lista não vazia de linhas comerciais.');
  }
  const grouped = new Map<string, OrderLineInput>();
  for (const input of inputs) {
    if (!record(input)) invalid('LINHAS_INVALIDAS', 'linhas', 'Linha comercial inválida.');
    if (typeof input.produtoId !== 'string' || input.produtoId.trim().length === 0) {
      invalid('PRODUTO_INVALIDO', 'produtoId', 'É necessário um identificador estável de produto.');
    }
    if (!safeInteger(input.versaoUnidade, 0)) {
      invalid('VERSAO_INVALIDA', 'versaoUnidade', 'É necessária uma versão inteira não negativa.');
    }
    validateOrderQuantity(input.quantidade);
    validateOrderPrice(input.precoReferenciaCent);
    validateOrderSaleUnit(input.unidadeVenda);
    if (input.stockDisponivel !== undefined)
      validateStock(input.stockDisponivel, input.unidadeVenda);
    const previous = grouped.get(input.produtoId);
    if (
      previous &&
      (previous.precoReferenciaCent !== input.precoReferenciaCent ||
        previous.versaoUnidade !== input.versaoUnidade ||
        previous.stockDisponivel !== input.stockDisponivel ||
        !compatibleUnits(previous.unidadeVenda, input.unidadeVenda))
    ) {
      invalid(
        'LINHAS_INCOMPATIVEIS',
        'linhas',
        'O mesmo produto apresenta condições incompatíveis.',
      );
    }
    const quantity = safeMoney(
      BigInt(previous?.quantidade ?? 0) + BigInt(input.quantidade),
      'quantidade',
    );
    grouped.set(input.produtoId, {
      produtoId: input.produtoId,
      versaoUnidade: input.versaoUnidade,
      quantidade: quantity,
      precoReferenciaCent: input.precoReferenciaCent,
      unidadeVenda: copyUnit(input.unidadeVenda),
      ...(input.stockDisponivel === undefined ? {} : { stockDisponivel: input.stockDisponivel }),
    });
  }
  const lines = [...grouped.values()].sort((a, b) =>
    a.produtoId < b.produtoId ? -1 : a.produtoId > b.produtoId ? 1 : 0,
  );
  // Mínimo, incremento, teto e stock só são aplicados à quantidade final por ID.
  for (const line of lines) {
    validateOrderLineQuantity(line.quantidade, line.unidadeVenda, line.stockDisponivel);
  }
  return lines;
}

export function calculateOrderProductsSubtotal(subtotals: readonly number[]): number {
  if (!Array.isArray(subtotals) || subtotals.length === 0) {
    invalid('LINHAS_INVALIDAS', 'subtotais', 'É necessária uma lista não vazia de subtotais.');
  }
  let total = 0n;
  for (const subtotal of subtotals) {
    validateOrderMoney(subtotal, 'subtotalCent');
    if (subtotal < minimumOrderLineSubtotalCents) {
      invalid(
        'SUBTOTAL_INFERIOR_MINIMO',
        'subtotalCent',
        'Cada subtotal deve ter pelo menos um cêntimo.',
      );
    }
    total += BigInt(subtotal);
  }
  return safeMoney(total, 'subtotalProdutosCent');
}

export function calculateOrderProducts(inputs: readonly OrderLineInput[]): OrderCalculatedProducts {
  const linhas = aggregateOrderLines(inputs).map((line) => ({
    produtoId: line.produtoId,
    versaoUnidade: line.versaoUnidade,
    quantidade: line.quantidade,
    precoReferenciaCent: line.precoReferenciaCent,
    unidadeSnapshot: copyUnit(line.unidadeVenda),
    subtotalCent: calculateOrderLineSubtotal(line),
  }));
  return {
    linhas,
    subtotalProdutosCent: calculateOrderProductsSubtotal(linhas.map((line) => line.subtotalCent)),
  };
}

export function calculateOrderDeliveryFee(
  modalidade: OrderReceptionModality,
  taxaEntregaCent: number,
): number {
  if (!orderReceptionModalities.includes(modalidade)) {
    invalid(
      'MODALIDADE_RECECAO_INVALIDA',
      'modalidadeRececao',
      'Modalidade de receção não suportada.',
    );
  }
  validateOrderMoney(taxaEntregaCent, 'taxaEntregaCent');
  return modalidade === 'levantamento' ? 0 : taxaEntregaCent;
}

export function calculateOrderTotal(subtotalProdutosCent: number, taxaEntregaCent: number): number {
  validateOrderMoney(subtotalProdutosCent, 'subtotalProdutosCent');
  validateOrderMoney(taxaEntregaCent, 'taxaEntregaCent');
  if (subtotalProdutosCent < minimumOrderLineSubtotalCents) {
    invalid(
      'SUBTOTAL_INFERIOR_MINIMO',
      'subtotalProdutosCent',
      'O subtotal deve ter pelo menos um cêntimo.',
    );
  }
  return safeMoney(BigInt(subtotalProdutosCent) + BigInt(taxaEntregaCent), 'totalCent');
}

export function calculateOrderAmounts(input: OrderAmountsInput): OrderAmounts {
  if (!record(input))
    invalid('LINHAS_INVALIDAS', 'encomenda', 'São necessárias condições de cálculo.');
  const products = calculateOrderProducts(input.linhas);
  const taxaEntregaCent = calculateOrderDeliveryFee(input.modalidadeRececao, input.taxaEntregaCent);
  return {
    ...products,
    taxaEntregaCent,
    totalCent: calculateOrderTotal(products.subtotalProdutosCent, taxaEntregaCent),
    moeda: orderCurrency,
  };
}
