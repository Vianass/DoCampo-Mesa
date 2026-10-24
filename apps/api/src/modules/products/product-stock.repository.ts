import { Types } from 'mongoose';
import type { ClientSession, Connection, mongo } from 'mongoose';
import {
  ConcurrencyError,
  operationalRevision,
  revisionCondition,
} from '../concurrency/concurrency-error.js';
import { operationDatabase, requireOperationSession } from '../concurrency/operation-session.js';
import {
  OrderValidationError,
  calculateOrderLineSubtotal,
  validateOrderLineQuantity,
  validateOrderSaleUnit,
} from '../orders/order.calculations.js';
import type { OrderSaleUnit } from '../orders/order.types.js';
import { saleDefinitions } from './product.constants.js';
import type { ProductRecord } from './product.types.js';

export interface ProductStockDecrease {
  readonly produtoId: Types.ObjectId;
  readonly produtorId: Types.ObjectId;
  readonly revisaoEsperada: number;
  readonly quantidade: number;
  readonly precoAceiteCent: number;
  readonly unidadeAceite: OrderSaleUnit;
}
export interface ProductStockResult {
  readonly produtoId: Types.ObjectId;
  readonly stockDisponivel: number;
  readonly revisaoOperacional: number;
}

function unitIdentity(value: OrderSaleUnit) {
  return JSON.stringify([
    value.modalidade,
    value.unidadeBase,
    value.quantidadeReferencia,
    value.quantidadeMinima,
    value.incrementoCompra,
    value.rotulo ?? null,
    value.conteudoPorUnidade?.quantidade ?? null,
    value.conteudoPorUnidade?.unidade ?? null,
  ]);
}
function validateInput(input: ProductStockDecrease) {
  if (
    !input ||
    !(input.produtoId instanceof Types.ObjectId) ||
    !(input.produtorId instanceof Types.ObjectId)
  ) {
    throw new ConcurrencyError('VALIDACAO', 'Identificadores internos inválidos.');
  }
  revisionCondition(input.revisaoEsperada);
  try {
    calculateOrderLineSubtotal({
      quantidade: input.quantidade,
      precoReferenciaCent: input.precoAceiteCent,
      unidadeVenda: input.unidadeAceite,
    });
  } catch (error) {
    if (!(error instanceof OrderValidationError)) throw error;
    throw new ConcurrencyError('VALIDACAO', 'Quantidade ou oferta comercial inválida.');
  }
}

export function validateProductStockCandidate(
  product: ProductRecord | null,
  input: ProductStockDecrease,
): void {
  validateInput(input);
  if (
    !product ||
    !product._id.equals(input.produtoId) ||
    !product.produtor.equals(input.produtorId) ||
    product.estadoPublicacao !== 'publicado'
  ) {
    throw new ConcurrencyError('PRODUTO_INDISPONIVEL', 'Produto indisponível para esta operação.');
  }
  if (operationalRevision(product.revisaoOperacional) !== input.revisaoEsperada)
    throw new ConcurrencyError('CONFLITO_VERSAO', 'A revisão do produto mudou.');
  if (product.precoCent !== input.precoAceiteCent || !product.unidadeVenda)
    throw new ConcurrencyError('OFERTA_ALTERADA', 'A oferta deve ser reconfirmada.');
  if (product.stockDisponivel === undefined)
    throw new ConcurrencyError('VALIDACAO', 'Stock não definido.');
  try {
    validateOrderSaleUnit(product.unidadeVenda);
    if (unitIdentity(product.unidadeVenda) !== unitIdentity(input.unidadeAceite))
      throw new ConcurrencyError('OFERTA_ALTERADA', 'A unidade comercial mudou.');
    validateOrderLineQuantity(input.quantidade, product.unidadeVenda, product.stockDisponivel);
  } catch (error) {
    if (!(error instanceof OrderValidationError)) throw error;
    throw new ConcurrencyError(
      error.codigo === 'STOCK_INSUFICIENTE' ? 'STOCK_INSUFICIENTE' : 'VALIDACAO',
      'Stock ou unidade incompatível com a operação.',
    );
  }
}

/** Operação única atómica; a composição com a guarda do produtor exige transação do chamador. */
export async function decreaseProductStock(
  connection: Connection,
  input: ProductStockDecrease,
  session?: ClientSession,
): Promise<ProductStockResult> {
  validateInput(input);
  requireOperationSession(session, false);
  const collection = operationDatabase(connection).collection<ProductRecord>('products');
  const options = session === undefined ? {} : { session };
  const product = await collection.findOne(
    { _id: input.produtoId, produtor: input.produtorId },
    options,
  );
  validateProductStockCandidate(product, input);
  if (!product) throw new Error('Validação interna de produto inconsistente.');
  const filter: mongo.Filter<ProductRecord> = {
    _id: input.produtoId,
    produtor: input.produtorId,
    estadoPublicacao: 'publicado',
    ...revisionCondition(input.revisaoEsperada),
    precoCent: input.precoAceiteCent,
    unidadeVenda: product.unidadeVenda,
    stockDisponivel: {
      $gte: input.quantidade,
      $lte: saleDefinitions[input.unidadeAceite.modalidade].stockMaximo,
    },
  };
  const result = await collection.findOneAndUpdate(
    filter,
    {
      $inc: { stockDisponivel: -input.quantidade, revisaoOperacional: 1 },
      $set: { updatedAt: new Date() },
    },
    {
      ...options,
      returnDocument: 'after',
      includeResultMetadata: false,
      projection: { _id: 1, stockDisponivel: 1, revisaoOperacional: 1 },
    },
  );
  if (!result) {
    const current = await collection.findOne(
      { _id: input.produtoId, produtor: input.produtorId },
      options,
    );
    validateProductStockCandidate(current, input);
    throw new ConcurrencyError(
      'CONFLITO_VERSAO',
      'A escrita do stock encontrou uma alteração concorrente.',
    );
  }
  return {
    produtoId: result._id,
    stockDisponivel: result.stockDisponivel!,
    revisaoOperacional: operationalRevision(result.revisaoOperacional),
  };
}
