import { isDeepStrictEqual } from 'node:util';
import type { ClientSession, Connection } from 'mongoose';
import {
  operationalRevision,
  revisionCondition,
  ConcurrencyError,
} from '../concurrency/concurrency-error.js';
import { requireOperationSession } from '../concurrency/operation-session.js';
import { saleDefinitions } from '../products/product.constants.js';
import type { ProductRecord } from '../products/product.types.js';
import type { AuctionRecord } from './auction.types.js';

/** Libertação idempotente: o saldo da auction é atualizado na mesma transação. */
export async function releaseAuctionStock(
  connection: Connection,
  auction: AuctionRecord,
  session: ClientSession,
) {
  requireOperationSession(session, true);
  const pending = auction.lote.quantidade - auction.reserva.reposta;
  const products = connection.db!.collection<ProductRecord>('products');
  const product = await products.findOne(
    { _id: auction.produto, produtor: auction.produtor },
    { session },
  );
  if (
    !product ||
    !isDeepStrictEqual(product.unidadeVenda, auction.lote.unidadeVenda) ||
    !Number.isSafeInteger(product.stockDisponivel) ||
    product.stockDisponivel! < 0
  )
    return { reposta: auction.reserva.reposta, pendente: pending };
  const amount = Math.min(
    pending,
    Math.max(
      0,
      saleDefinitions[auction.lote.unidadeVenda.modalidade].stockMaximo - product.stockDisponivel!,
    ),
  );
  if (!amount) return { reposta: auction.reserva.reposta, pendente: pending };
  const changed = await products.findOneAndUpdate(
    {
      _id: product._id,
      produtor: auction.produtor,
      ...revisionCondition(operationalRevision(product.revisaoOperacional)),
      unidadeVenda: product.unidadeVenda,
      stockDisponivel: product.stockDisponivel,
    },
    { $inc: { stockDisponivel: amount, revisaoOperacional: 1 }, $currentDate: { updatedAt: true } },
    { session, returnDocument: 'after', includeResultMetadata: false, projection: { _id: 1 } },
  );
  if (!changed)
    throw new ConcurrencyError('CONFLITO_VERSAO', 'Stock alterado durante a libertação.');
  return { reposta: auction.reserva.reposta + amount, pendente: pending - amount };
}
