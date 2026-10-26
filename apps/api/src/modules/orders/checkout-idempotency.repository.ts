import type { ClientSession, Connection } from 'mongoose';
import type { CheckoutTechnicalLimits, ValidatedCheckoutInput } from './checkout.contract.js';
import { resolveCheckoutLimits } from './checkout.validation.js';
import {
  checkoutAnchorOperation,
  identifyCheckout,
  inspectCheckoutGroup,
  isCheckoutReadUnavailable,
  uncertainCheckoutRead,
} from './checkout.idempotency.js';
import type {
  CheckoutIdempotencyIdentity,
  CheckoutIdempotencyResult,
} from './checkout.idempotency.js';

export interface CheckoutIdempotencyReadOptions {
  readonly limites?: Partial<CheckoutTechnicalLimits>;
  readonly timeoutMS?: number;
}

/** Metadados apenas: não lê linhas, moradas, contactos, pagamentos, reclamações ou auditoria. */
export const checkoutIdempotencyProjection = Object.freeze({
  _id: 1,
  comprador: 1,
  produtor: 1,
  operacaoCompraId: 1,
  totalCent: 1,
  moeda: 1,
  idempotencia: 1,
});

async function readGroup(
  connection: Connection,
  session: ClientSession,
  expected: CheckoutIdempotencyIdentity,
  maxOrders: number,
  recovering: boolean,
): Promise<CheckoutIdempotencyResult> {
  const collection = connection.db!.collection('orders');
  const anchor = await collection.findOne(
    { 'idempotencia.chave': expected.chave },
    { session, projection: checkoutIdempotencyProjection },
  );
  if (!anchor)
    return recovering
      ? uncertainCheckoutRead('CONFIRMACAO_NAO_OBSERVADA')
      : Object.freeze({ tipo: 'inexistente' });
  const op = checkoutAnchorOperation(anchor, expected);
  if (!op) return uncertainCheckoutRead('GRUPO_INCONSISTENTE');
  const members = await collection
    .find({ operacaoCompraId: op }, { session, projection: checkoutIdempotencyProjection })
    .limit(maxOrders + 1)
    .toArray();
  return inspectCheckoutGroup(anchor, members, expected, maxOrders);
}

async function lookup(
  connection: Connection,
  input: ValidatedCheckoutInput,
  recovering: boolean,
  options: CheckoutIdempotencyReadOptions,
): Promise<CheckoutIdempotencyResult> {
  const limits = resolveCheckoutLimits(options.limites);
  const expected = identifyCheckout(input, limits);
  const timeoutMS = options.timeoutMS ?? 5000;
  if (!Number.isSafeInteger(timeoutMS) || timeoutMS < 1 || limits.maxProdutores >= 2_147_483_647)
    throw new Error('Orçamento de leitura de idempotência inválido.');
  if (connection.readyState !== 1 || !connection.db)
    return uncertainCheckoutRead('PERSISTENCIA_INDISPONIVEL');
  let session: ClientSession | undefined;
  try {
    session = await connection.startSession();
    // Sessão própria de leitura: nunca toma dados ainda não confirmados do futuro checkout como replay.
    return await session.withTransaction(
      () => readGroup(connection, session!, expected, limits.maxProdutores, recovering),
      {
        readConcern: { level: 'snapshot' },
        writeConcern: { w: 'majority' },
        readPreference: 'primary',
        timeoutMS,
      },
    );
  } catch (error) {
    if (isCheckoutReadUnavailable(error)) return uncertainCheckoutRead('PERSISTENCIA_INDISPONIVEL');
    throw error;
  } finally {
    if (session) await session.endSession();
  }
}

/** Ausência significa apenas que esta chave não foi observada confirmada neste snapshot. */
export function findCheckoutPurchase(
  connection: Connection,
  input: ValidatedCheckoutInput,
  options: CheckoutIdempotencyReadOptions = {},
): Promise<CheckoutIdempotencyResult> {
  return lookup(connection, input, false, options);
}

/** Depois de commit incerto/timeout, ausência nunca é reinterpretada como rollback definitivo. */
export function recoverCheckoutPurchase(
  connection: Connection,
  input: ValidatedCheckoutInput,
  options: CheckoutIdempotencyReadOptions = {},
): Promise<CheckoutIdempotencyResult> {
  return lookup(connection, input, true, options);
}
