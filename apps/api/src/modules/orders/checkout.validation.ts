import { Buffer } from 'node:buffer';
import { producerCommercialTextLimits } from '../producers/producer-commercial.constants.js';
import {
  aggregateOrderLines,
  calculateOrderAmounts,
  calculateOrderProductsSubtotal,
  OrderValidationError,
  validateOrderMoney,
  validateOrderPrice,
  validateOrderQuantity,
  validateOrderSaleUnit,
} from './order.calculations.js';
import { orderPaymentMethods, orderReceptionModalities } from './order.constants.js';
import type { OrderLineInput, OrderSaleUnit } from './order.types.js';
import { CheckoutValidationError, checkoutTechnicalLimits } from './checkout.contract.js';
import type {
  CheckoutLine,
  CheckoutPeriod,
  CheckoutProducerConditions,
  CheckoutTechnicalLimits,
  CheckoutValidationCode,
  ValidatedCheckoutInput,
} from './checkout.contract.js';

function invalid(code: CheckoutValidationCode, field: string, message: string): never {
  throw new CheckoutValidationError(code, field, message);
}

function object(
  value: unknown,
  allowed: readonly string[],
  required: readonly string[],
  field: string,
) {
  if (
    value === null ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value))
  )
    invalid('PEDIDO_INVALIDO', field, 'É necessário um objeto simples.');
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
    if (
      typeof key !== 'string' ||
      !allowed.includes(key) ||
      !descriptor.enumerable ||
      !('value' in descriptor)
    )
      invalid('PEDIDO_INVALIDO', field, 'A estrutura contém campos não autorizados.');
  }
  for (const key of required)
    if (!Object.hasOwn(value, key))
      invalid('PEDIDO_INVALIDO', field + '.' + key, 'Campo obrigatório.');
  return value as Record<string, unknown>;
}

function list(value: unknown, maximum: number, field: string): unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype)
    invalid('PEDIDO_INVALIDO', field, 'É necessária uma lista simples.');
  if (!value.length) invalid('PEDIDO_INVALIDO', field, 'A lista não pode estar vazia.');
  if (value.length > maximum)
    invalid('LIMITE_TECNICO_EXCEDIDO', field, 'A lista excede o orçamento técnico.');
  if (Reflect.ownKeys(value).length !== value.length + 1)
    invalid('PEDIDO_INVALIDO', field, 'Lista incompleta ou com propriedades adicionais.');
  for (let i = 0; i < value.length; i++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(i));
    if (!descriptor || !descriptor.enumerable || !('value' in descriptor))
      invalid('PEDIDO_INVALIDO', field, 'Lista incompleta ou com acessores.');
  }
  return value;
}

function identifier(value: unknown, field: string): string {
  if (typeof value !== 'string' || !/^[a-fA-F0-9]{24}$/.test(value))
    invalid('PEDIDO_INVALIDO', field, 'É necessário um identificador interno válido.');
  return value.toLowerCase();
}

function integer(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)
    invalid('PEDIDO_INVALIDO', field, 'É necessário um inteiro seguro não negativo.');
  return Object.is(value, -0) ? 0 : value;
}

function text(value: unknown, maximum: number, field: string): string {
  if (typeof value !== 'string') invalid('PEDIDO_INVALIDO', field, 'É necessário texto.');
  // Limitar antes da normalização evita processar strings excessivas.
  if (value.length > maximum * 2)
    invalid('LIMITE_TECNICO_EXCEDIDO', field, 'Texto demasiado extenso.');
  const normalized = value.normalize('NFC').trim();
  if (!normalized || /[\p{Cc}\p{Cs}]/u.test(normalized))
    invalid('PEDIDO_INVALIDO', field, 'Texto vazio ou com caracteres inválidos.');
  if ([...normalized].length > maximum)
    invalid('LIMITE_TECNICO_EXCEDIDO', field, 'Texto demasiado extenso.');
  return normalized;
}

function commercial<T>(field: string, fn: () => T): T {
  try {
    return fn();
  } catch (error) {
    if (!(error instanceof OrderValidationError)) throw error;
    const quantity = [
      'QUANTIDADE_INVALIDA',
      'QUANTIDADE_MINIMA',
      'INCREMENTO_INVALIDO',
      'QUANTIDADE_MAXIMA',
    ];
    const code = quantity.includes(error.codigo) ? 'QUANTIDADE_INVALIDA' : 'OFERTA_INCOERENTE';
    invalid(code, field, 'Os valores aceites não respeitam as regras comerciais.');
  }
}

function unit(value: unknown, limits: CheckoutTechnicalLimits, field: string): OrderSaleUnit {
  const keys = [
    'modalidade',
    'unidadeBase',
    'quantidadeReferencia',
    'quantidadeMinima',
    'incrementoCompra',
  ];
  const input = object(value, [...keys, 'rotulo', 'conteudoPorUnidade'], keys, field);
  const result = { ...input };
  if (Object.hasOwn(input, 'rotulo'))
    result.rotulo = text(input.rotulo, limits.maxTexto, field + '.rotulo');
  if (Object.hasOwn(input, 'conteudoPorUnidade')) {
    const content = object(
      input.conteudoPorUnidade,
      ['quantidade', 'unidade'],
      ['quantidade', 'unidade'],
      field + '.conteudoPorUnidade',
    );
    result.conteudoPorUnidade = { quantidade: content.quantidade, unidade: content.unidade };
  }
  return commercial(field, () => {
    validateOrderSaleUnit(result);
    return result;
  });
}

function instant(value: unknown, field: string): string {
  if (value instanceof Date) {
    if (Object.getPrototypeOf(value) !== Date.prototype || Reflect.ownKeys(value).length)
      invalid('PEDIDO_INVALIDO', field, 'Data com representação inesperada.');
    const timestamp = Date.prototype.getTime.call(value);
    if (!Number.isFinite(timestamp)) invalid('PEDIDO_INVALIDO', field, 'Data inválida.');
    const normalized = new Date(timestamp).toISOString();
    if (!/^\d{4}-/.test(normalized))
      invalid('PEDIDO_INVALIDO', field, 'Data fora da representação suportada.');
    return normalized;
  }
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)
  )
    invalid('PEDIDO_INVALIDO', field, 'É necessário um instante UTC explícito.');
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) invalid('PEDIDO_INVALIDO', field, 'Data inválida.');
  const normalized = new Date(timestamp).toISOString();
  const padded = value.replace(
    /(?:\.(\d{1,3}))?Z$/,
    (_match, fraction: string | undefined) => '.' + (fraction ?? '').padEnd(3, '0') + 'Z',
  );
  if (normalized !== padded) invalid('PEDIDO_INVALIDO', field, 'Data de calendário inválida.');
  return normalized;
}

function period(value: unknown, field: string): CheckoutPeriod {
  const keys = ['inicioEm', 'fimEm', 'fusoHorario'];
  const input = object(value, keys, keys, field);
  const inicioEm = instant(input.inicioEm, field + '.inicioEm');
  const fimEm = instant(input.fimEm, field + '.fimEm');
  if (inicioEm >= fimEm)
    invalid('SELECAO_COMERCIAL_INVALIDA', field, 'O fim deve ser posterior ao início.');
  const zone = input.fusoHorario;
  if (
    typeof zone !== 'string' ||
    zone.length > producerCommercialTextLimits.timeZone ||
    !/^[A-Za-z_]+(?:\/[A-Za-z0-9_+.-]+)*$/.test(zone)
  )
    invalid('SELECAO_COMERCIAL_INVALIDA', field + '.fusoHorario', 'Fuso IANA inválido.');
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
  } catch (error) {
    if (!(error instanceof RangeError)) throw error;
    invalid('SELECAO_COMERCIAL_INVALIDA', field + '.fusoHorario', 'Fuso IANA inválido.');
  }
  return { inicioEm, fimEm, fusoHorario: zone };
}

function conditions(
  value: unknown,
  limits: CheckoutTechnicalLimits,
  field: string,
): CheckoutProducerConditions {
  const keys = [
    'produtorContaId',
    'modalidade',
    'periodo',
    'metodoPagamento',
    'taxaEntregaAceiteCent',
    'revisaoProdutorObservada',
  ];
  const input = object(value, [...keys, 'concelhoId', 'morada', 'contacto'], keys, field);
  const modalidade = orderReceptionModalities.find((mode) => mode === input.modalidade);
  const metodoPagamento = orderPaymentMethods.find((method) => method === input.metodoPagamento);
  if (!modalidade || !metodoPagamento)
    invalid(
      'SELECAO_COMERCIAL_INVALIDA',
      field,
      'Modalidade ou método de pagamento não suportado.',
    );
  const taxaEntregaAceiteCent = commercial(field, () => {
    validateOrderMoney(input.taxaEntregaAceiteCent);
    return input.taxaEntregaAceiteCent;
  });
  const base = {
    produtorContaId: identifier(input.produtorContaId, field + '.produtorContaId'),
    periodo: period(input.periodo, field + '.periodo'),
    metodoPagamento,
    taxaEntregaAceiteCent: Object.is(taxaEntregaAceiteCent, -0) ? 0 : taxaEntregaAceiteCent,
    revisaoProdutorObservada: integer(
      input.revisaoProdutorObservada,
      field + '.revisaoProdutorObservada',
    ),
  };
  if (modalidade === 'levantamento') {
    if (
      base.taxaEntregaAceiteCent !== 0 ||
      ['concelhoId', 'morada', 'contacto'].some((key) => Object.hasOwn(input, key))
    )
      invalid('SELECAO_COMERCIAL_INVALIDA', field, 'Levantamento sem taxa ou dados de entrega.');
    return { ...base, modalidade };
  }
  const concelho = input.concelhoId;
  if (
    typeof concelho !== 'string' ||
    !concelho ||
    concelho.length > producerCommercialTextLimits.identifier * 2 ||
    [...concelho].length > producerCommercialTextLimits.identifier ||
    /[\s\p{Cc}\p{Cs}]/u.test(concelho)
  )
    invalid(
      'SELECAO_COMERCIAL_INVALIDA',
      field + '.concelhoId',
      'Identificador estável de concelho inválido.',
    );
  return {
    ...base,
    modalidade,
    concelhoId: concelho,
    morada: text(input.morada, limits.maxTexto, field + '.morada'),
    contacto: text(input.contacto, limits.maxTexto, field + '.contacto'),
  };
}

export function resolveCheckoutLimits(
  overrides: Partial<CheckoutTechnicalLimits> = {},
): CheckoutTechnicalLimits {
  const keys = Object.keys(checkoutTechnicalLimits);
  const input = object(overrides, keys, [], 'limites');
  const result = { ...checkoutTechnicalLimits, ...input };
  for (const key of keys) {
    const value = result[key as keyof CheckoutTechnicalLimits];
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1)
      invalid('PEDIDO_INVALIDO', 'limites', 'Orçamento técnico positivo obrigatório.');
  }
  return result;
}

function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

export function validateCheckoutInput(
  context: unknown,
  key: unknown,
  request: unknown,
  overrides: Partial<CheckoutTechnicalLimits> = {},
): ValidatedCheckoutInput {
  const limits = resolveCheckoutLimits(overrides);
  const identity = object(context, ['compradorContaId'], ['compradorContaId'], 'contexto');
  const compradorContaId = identifier(identity.compradorContaId, 'contexto.compradorContaId');
  if (typeof key !== 'string' || !/^[\x21-\x7e]{1,128}$/.test(key))
    invalid(
      'PEDIDO_INVALIDO',
      'chaveIdempotencia',
      'Chave opaca ASCII de 1 a 128 caracteres obrigatória.',
    );
  const root = object(
    request,
    ['linhas', 'condicoesPorProdutor'],
    ['linhas', 'condicoesPorProdutor'],
    'pedido',
  );
  const rawLines = list(root.linhas, limits.maxLinhas, 'pedido.linhas');
  const rawConditions = list(
    root.condicoesPorProdutor,
    limits.maxProdutores,
    'pedido.condicoesPorProdutor',
  );
  const producerByProduct = new Map<string, string>();
  const lines: CheckoutLine[] = rawLines.map((value, i) => {
    const field = `pedido.linhas[${i}]`;
    const keys = ['produtoId', 'produtorContaId', 'quantidade', 'ofertaAceite'];
    const input = object(value, keys, keys, field);
    const produtoId = identifier(input.produtoId, field + '.produtoId');
    const produtorContaId = identifier(input.produtorContaId, field + '.produtorContaId');
    const previous = producerByProduct.get(produtoId);
    if (previous && previous !== produtorContaId)
      invalid(
        'CONDICOES_PRODUTOR_INCOERENTES',
        field,
        'O produto tem associações declaradas contraditórias.',
      );
    producerByProduct.set(produtoId, produtorContaId);
    if (producerByProduct.size > limits.maxProdutos)
      invalid(
        'LIMITE_TECNICO_EXCEDIDO',
        'pedido.linhas',
        'Demasiados produtos distintos para o orçamento técnico.',
      );
    const offerKeys = ['precoReferenciaCent', 'unidadeVenda', 'revisaoProdutoObservada'];
    const offer = object(input.ofertaAceite, offerKeys, offerKeys, field + '.ofertaAceite');
    const quantidade = commercial(field + '.quantidade', () => {
      validateOrderQuantity(input.quantidade);
      return input.quantidade;
    });
    const precoReferenciaCent = commercial(field + '.ofertaAceite', () => {
      validateOrderPrice(offer.precoReferenciaCent);
      return offer.precoReferenciaCent;
    });
    return {
      produtoId,
      produtorContaId,
      quantidade,
      ofertaAceite: {
        precoReferenciaCent,
        unidadeVenda: unit(offer.unidadeVenda, limits, field + '.ofertaAceite.unidadeVenda'),
        revisaoProdutoObservada: integer(
          offer.revisaoProdutoObservada,
          field + '.ofertaAceite.revisaoProdutoObservada',
        ),
      },
    };
  });
  const selections = rawConditions.map((value, i) =>
    conditions(value, limits, `pedido.condicoesPorProdutor[${i}]`),
  );
  const producerIds = new Set(lines.map((line) => line.produtorContaId));
  const selectedIds = new Set(selections.map((selection) => selection.produtorContaId));
  if (
    selectedIds.size !== selections.length ||
    selectedIds.size !== producerIds.size ||
    [...producerIds].some((id) => !selectedIds.has(id))
  )
    invalid(
      'CONDICOES_PRODUTOR_INCOERENTES',
      'pedido.condicoesPorProdutor',
      'É necessária exatamente uma seleção por produtor declarado.',
    );
  const raw = {
    contexto: { compradorContaId },
    chaveIdempotencia: key,
    pedido: { linhas: lines, condicoesPorProdutor: selections },
  };
  if (Buffer.byteLength(JSON.stringify(raw), 'utf8') > limits.maxPedidoBytes)
    invalid('LIMITE_TECNICO_EXCEDIDO', 'pedido', 'O pedido excede o orçamento técnico em bytes.');
  const calculationLines: OrderLineInput[] = lines.map((line) => ({
    produtoId: line.produtoId,
    quantidade: line.quantidade,
    precoReferenciaCent: line.ofertaAceite.precoReferenciaCent,
    unidadeVenda: line.ofertaAceite.unidadeVenda,
    versaoUnidade: line.ofertaAceite.revisaoProdutoObservada,
  }));
  const aggregated = commercial('pedido.linhas', () => aggregateOrderLines(calculationLines));
  const normalizedLines = aggregated.map((line) => ({
    produtoId: line.produtoId,
    produtorContaId: producerByProduct.get(line.produtoId)!,
    quantidade: line.quantidade,
    ofertaAceite: {
      precoReferenciaCent: line.precoReferenciaCent,
      unidadeVenda: line.unidadeVenda,
      revisaoProdutoObservada: line.versaoUnidade,
    },
  }));
  // Apenas coerência dos valores aceites: não constitui cotação atual nem resultado de checkout.
  commercial('pedido', () =>
    calculateOrderProductsSubtotal(
      selections.map(
        (selection) =>
          calculateOrderAmounts({
            linhas: aggregated.filter(
              (line) => producerByProduct.get(line.produtoId) === selection.produtorContaId,
            ),
            modalidadeRececao: selection.modalidade,
            taxaEntregaCent: selection.taxaEntregaAceiteCent,
          }).totalCent,
      ),
    ),
  );
  selections.sort((a, b) =>
    a.produtorContaId < b.produtorContaId ? -1 : a.produtorContaId > b.produtorContaId ? 1 : 0,
  );
  return freeze({
    contexto: { compradorContaId },
    chaveIdempotencia: key,
    pedido: { linhas: normalizedLines, condicoesPorProdutor: selections },
  });
}
