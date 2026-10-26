import { Types, mongo } from 'mongoose';
import { checkoutTechnicalLimits, CheckoutValidationError } from './checkout.contract.js';
import type {
  CheckoutReceipt,
  CheckoutResult,
  CheckoutTechnicalLimits,
  ValidatedCheckoutInput,
} from './checkout.contract.js';
import { fingerprintCheckout } from './checkout.fingerprint.js';
import { validateCheckoutInput } from './checkout.validation.js';
import { calculateOrderAmounts, calculateOrderProductsSubtotal } from './order.calculations.js';
import type { OrderIdempotency, OrderRecord } from './order.types.js';
import { orderPersistenceSafety } from './order.validation.js';

export interface CheckoutIdempotencyIdentity {
  readonly compradorContaId: string;
  readonly chave: string;
  readonly hashCanonico: string;
  readonly totaisPorProdutor: readonly {
    readonly produtorContaId: string;
    readonly totalCent: number;
  }[];
}

export type CheckoutReadUncertainty =
  | 'CONFIRMACAO_NAO_OBSERVADA'
  | 'GRUPO_INCONSISTENTE'
  | 'PERSISTENCIA_INDISPONIVEL'
  | 'LIMITE_TECNICO';
export type CheckoutIdempotencyResult =
  | { readonly tipo: 'inexistente' }
  | (Extract<CheckoutResult, { tipo: 'sucesso' }> & { readonly origem: 'replay' })
  | (Extract<CheckoutResult, { tipo: 'resultado_indeterminado' }> & {
      readonly motivo: CheckoutReadUncertainty;
    });

export class CheckoutIdempotencyConflict extends Error {
  readonly codigo = 'CONFLITO_IDEMPOTENCIA';
  constructor() {
    super('Não é possível reutilizar a chave para este pedido.');
    this.name = 'CheckoutIdempotencyConflict';
  }
}

export function uncertainCheckoutRead(motivo: CheckoutReadUncertainty): CheckoutIdempotencyResult {
  return Object.freeze({
    tipo: 'resultado_indeterminado',
    codigo: 'RESULTADO_DESCONHECIDO',
    repetirComMesmaChave: true,
    motivo,
  });
}

/** Deriva metadados do pedido original; não consulta preços/stock atuais nem autentica o contexto. */
export function identifyCheckout(
  input: ValidatedCheckoutInput,
  limits: Partial<CheckoutTechnicalLimits> = {},
): CheckoutIdempotencyIdentity {
  const normalized = validateCheckoutInput(
    input.contexto,
    input.chaveIdempotencia,
    input.pedido,
    limits,
  );
  const totaisPorProdutor = normalized.pedido.condicoesPorProdutor.map((selection) =>
    Object.freeze({
      produtorContaId: selection.produtorContaId,
      totalCent: calculateOrderAmounts({
        linhas: normalized.pedido.linhas
          .filter((line) => line.produtorContaId === selection.produtorContaId)
          .map((line) => ({
            produtoId: line.produtoId,
            quantidade: line.quantidade,
            precoReferenciaCent: line.ofertaAceite.precoReferenciaCent,
            unidadeVenda: line.ofertaAceite.unidadeVenda,
            versaoUnidade: line.ofertaAceite.revisaoProdutoObservada,
          })),
        modalidadeRececao: selection.modalidade,
        taxaEntregaCent: selection.taxaEntregaAceiteCent,
      }).totalCent,
    }),
  );
  return Object.freeze({
    compradorContaId: normalized.contexto.compradorContaId,
    chave: normalized.chaveIdempotencia,
    hashCanonico: fingerprintCheckout(
      normalized.contexto,
      normalized.chaveIdempotencia,
      normalized.pedido,
      limits,
    ),
    totaisPorProdutor: Object.freeze(totaisPorProdutor),
  });
}

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function id(value: unknown): value is Types.ObjectId {
  return value instanceof Types.ObjectId;
}
function money(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 1;
}
function operation(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    [...value].length <= orderPersistenceSafety.identifierCharacters &&
    value === value.normalize('NFC').trim()
  );
}

/** Autoriza antes de ler membros do grupo. Nunca revela comprador/hash de uma chave alheia. */
export function checkoutAnchorOperation(
  anchor: unknown,
  expected: CheckoutIdempotencyIdentity,
): string | undefined {
  if (
    !object(anchor) ||
    !id(anchor.comprador) ||
    anchor.comprador.toHexString() !== expected.compradorContaId
  )
    throw new CheckoutIdempotencyConflict();
  const metadata = anchor.idempotencia;
  if (
    !object(metadata) ||
    metadata.chave !== expected.chave ||
    typeof metadata.hashCanonico !== 'string'
  )
    return undefined;
  if (metadata.hashCanonico !== expected.hashCanonico) throw new CheckoutIdempotencyConflict();
  return id(anchor._id) && operation(anchor.operacaoCompraId) ? anchor.operacaoCompraId : undefined;
}

/** Apenas verifica uma observação já lida: a prova de leitura confirmada pertence ao repositório. */
export function inspectCheckoutGroup(
  anchor: unknown,
  members: readonly unknown[],
  expected: CheckoutIdempotencyIdentity,
  maxOrders = checkoutTechnicalLimits.maxProdutores,
): CheckoutIdempotencyResult {
  const op = checkoutAnchorOperation(anchor, expected);
  if (!op || !object(anchor) || !object(anchor.idempotencia))
    return uncertainCheckoutRead('GRUPO_INCONSISTENTE');
  const metadata = anchor.idempotencia;
  const original = metadata.resultadoOriginal;
  const manifest = metadata.encomendas;
  if (!object(original) || !Array.isArray(manifest) || !Array.isArray(original.encomendas))
    return uncertainCheckoutRead('GRUPO_INCONSISTENTE');
  if (
    manifest.length > maxOrders ||
    members.length > maxOrders ||
    original.encomendas.length > maxOrders
  )
    return uncertainCheckoutRead('LIMITE_TECNICO');
  if (
    !manifest.length ||
    manifest.length !== members.length ||
    manifest.length !== original.encomendas.length ||
    original.operacaoCompraId !== op ||
    original.moeda !== 'EUR' ||
    !money(original.totalCent) ||
    !(original.criadaEm instanceof Date) ||
    !Number.isFinite(original.criadaEm.getTime())
  )
    return uncertainCheckoutRead('GRUPO_INCONSISTENTE');
  const ids = new Set<string>();
  for (const item of manifest) {
    if (!id(item) || ids.has(item.toHexString()))
      return uncertainCheckoutRead('GRUPO_INCONSISTENTE');
    ids.add(item.toHexString());
  }
  if (!id(anchor._id) || !ids.has(anchor._id.toHexString()))
    return uncertainCheckoutRead('GRUPO_INCONSISTENTE');
  const byId = new Map<string, Record<string, unknown>>();
  const producers = new Set<string>();
  for (const member of members) {
    if (
      !object(member) ||
      !id(member._id) ||
      !id(member.comprador) ||
      !id(member.produtor) ||
      member.comprador.toHexString() !== expected.compradorContaId ||
      member.operacaoCompraId !== op ||
      !ids.has(member._id.toHexString()) ||
      byId.has(member._id.toHexString()) ||
      producers.has(member.produtor.toHexString()) ||
      member.moeda !== 'EUR' ||
      !money(member.totalCent)
    )
      return uncertainCheckoutRead('GRUPO_INCONSISTENTE');
    const isAnchor = member._id.equals(anchor._id);
    if (isAnchor) {
      if (
        !object(member.idempotencia) ||
        member.idempotencia.chave !== expected.chave ||
        member.idempotencia.hashCanonico !== expected.hashCanonico
      )
        return uncertainCheckoutRead('GRUPO_INCONSISTENTE');
    } else if (member.idempotencia !== undefined && member.idempotencia !== null)
      return uncertainCheckoutRead('GRUPO_INCONSISTENTE');
    producers.add(member.produtor.toHexString());
    byId.set(member._id.toHexString(), member);
  }
  const expectedAmounts = new Map(
    expected.totaisPorProdutor.map((item) => [item.produtorContaId, item.totalCent]),
  );
  if (
    expectedAmounts.size !== producers.size ||
    [...producers].some((producer) => !expectedAmounts.has(producer))
  )
    return uncertainCheckoutRead('GRUPO_INCONSISTENTE');
  const anchorMember = byId.get(anchor._id.toHexString());
  if (
    !anchorMember ||
    !id(anchorMember.produtor) ||
    anchorMember.produtor.toHexString() !== [...producers].sort()[0]
  )
    return uncertainCheckoutRead('GRUPO_INCONSISTENTE');
  const receiptIds = new Set<string>();
  const orders: CheckoutReceipt['encomendas'][number][] = [];
  let total = 0n;
  for (const entry of original.encomendas) {
    if (
      !object(entry) ||
      !id(entry.orderId) ||
      !id(entry.produtor) ||
      entry.estadoInicial !== 'pendente' ||
      !money(entry.totalCent)
    )
      return uncertainCheckoutRead('GRUPO_INCONSISTENTE');
    const orderId = entry.orderId.toHexString();
    const member = byId.get(orderId);
    if (
      !member ||
      receiptIds.has(orderId) ||
      !id(member.produtor) ||
      !member.produtor.equals(entry.produtor) ||
      member.totalCent !== entry.totalCent ||
      expectedAmounts.get(entry.produtor.toHexString()) !== entry.totalCent
    )
      return uncertainCheckoutRead('GRUPO_INCONSISTENTE');
    receiptIds.add(orderId);
    total += BigInt(entry.totalCent);
    orders.push(
      Object.freeze({
        orderId,
        produtorContaId: entry.produtor.toHexString(),
        estadoInicial: 'pendente',
        totalCent: entry.totalCent,
      }),
    );
  }
  if (total !== BigInt(original.totalCent)) return uncertainCheckoutRead('GRUPO_INCONSISTENTE');
  const recibo: CheckoutReceipt = Object.freeze({
    operacaoCompraId: op,
    criadaEm: original.criadaEm.toISOString(),
    encomendas: Object.freeze(orders),
    totalCent: original.totalCent,
    moeda: 'EUR',
  });
  return Object.freeze({ tipo: 'sucesso', origem: 'replay', recibo });
}

export type CheckoutOrderSeed = Pick<
  OrderRecord,
  | '_id'
  | 'operacaoCompraId'
  | 'comprador'
  | 'produtor'
  | 'totalCent'
  | 'moeda'
  | 'estado'
  | 'createdAt'
>;
export interface CheckoutIdempotencyPlan {
  readonly ancoraOrderId: Types.ObjectId;
  readonly idempotencia: OrderIdempotency;
}

/** Prepara somente metadados para documentos já planeados; não gera IDs, não escreve nem cria orders. */
export function prepareCheckoutIdempotency(
  input: ValidatedCheckoutInput,
  seeds: readonly CheckoutOrderSeed[],
  limits: Partial<CheckoutTechnicalLimits> = {},
): CheckoutIdempotencyPlan {
  const expected = identifyCheckout(input, limits);
  const fail = (): never => {
    throw new CheckoutValidationError(
      'CONDICOES_PRODUTOR_INCOERENTES',
      'encomendas',
      'O grupo planeado é incompatível com o pedido.',
    );
  };
  if (!Array.isArray(seeds) || !seeds.length || seeds.length !== expected.totaisPorProdutor.length)
    fail();
  const totals = new Map(
    expected.totaisPorProdutor.map((item) => [item.produtorContaId, item.totalCent]),
  );
  const ids = new Set<string>();
  const producers = new Set<string>();
  let op: string | undefined;
  for (const seed of seeds) {
    if (
      !seed ||
      !id(seed._id) ||
      !id(seed.comprador) ||
      !id(seed.produtor) ||
      seed.comprador.toHexString() !== expected.compradorContaId ||
      !operation(seed.operacaoCompraId) ||
      (op !== undefined && op !== seed.operacaoCompraId) ||
      seed.estado !== 'pendente' ||
      seed.moeda !== 'EUR' ||
      !money(seed.totalCent) ||
      totals.get(seed.produtor.toHexString()) !== seed.totalCent ||
      ids.has(seed._id.toHexString()) ||
      producers.has(seed.produtor.toHexString()) ||
      !(seed.createdAt instanceof Date) ||
      !Number.isFinite(seed.createdAt.getTime()) ||
      (seed as CheckoutOrderSeed & { idempotencia?: unknown }).idempotencia != null
    )
      fail();
    op = seed.operacaoCompraId;
    ids.add(seed._id.toHexString());
    producers.add(seed.produtor.toHexString());
  }
  const ordered = [...seeds].sort((a, b) =>
    a.produtor.toHexString() < b.produtor.toHexString() ? -1 : 1,
  );
  const anchor = ordered[0]!;
  const cloneId = (value: Types.ObjectId) => new Types.ObjectId(value.toHexString());
  const encomendas = ordered.map((seed) => ({
    orderId: cloneId(seed._id),
    produtor: cloneId(seed.produtor),
    estadoInicial: 'pendente' as const,
    totalCent: seed.totalCent,
  }));
  return {
    ancoraOrderId: cloneId(anchor._id),
    idempotencia: {
      chave: expected.chave,
      hashCanonico: expected.hashCanonico,
      encomendas: encomendas.map((item) => cloneId(item.orderId)),
      resultadoOriginal: {
        operacaoCompraId: op!,
        criadaEm: new Date(anchor.createdAt.getTime()),
        encomendas,
        totalCent: calculateOrderProductsSubtotal(encomendas.map((item) => item.totalCent)),
        moeda: 'EUR',
      },
    },
  };
}

/** Classifica só a violação do índice global existente, sem interpretar mensagens ou keyValue. */
export function isCheckoutIdempotencyKeyConflict(error: unknown): boolean {
  if (!(error instanceof mongo.MongoServerError) || error.code !== 11000) return false;
  const pattern: unknown = error.keyPattern;
  return (
    object(pattern) && Object.keys(pattern).length === 1 && pattern['idempotencia.chave'] === 1
  );
}

export function isCheckoutReadUnavailable(error: unknown): boolean {
  return (
    error instanceof mongo.MongoNetworkError ||
    error instanceof mongo.MongoServerSelectionError ||
    error instanceof mongo.MongoOperationTimeoutError ||
    (error instanceof mongo.MongoServerError &&
      (error.code === 50 ||
        error.code === 112 ||
        error.hasErrorLabel('TransientTransactionError') ||
        error.hasErrorLabel('UnknownTransactionCommitResult')))
  );
}
