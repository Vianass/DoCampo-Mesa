import type { Connection, Types } from 'mongoose';
import { createOrderModel } from '../../src/modules/orders/order.model.js';
import { orderInput } from './order-fixtures.js';
/** Histórico fictício explícito: não constitui nem implementa confirmação operacional de receção. */
export async function historicalReviewOrder(
  connection: Connection,
  ids: { buyer: Types.ObjectId; producer: Types.ObjectId; product: Types.ObjectId },
) {
  const input = orderInput('concluida');
  const replace = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(replace);
    if (value && typeof value === 'object' && !(value instanceof Date) && !('_bsontype' in value)) {
      const item = value as Record<string, unknown>;
      if (item.tipo === 'utilizador')
        return { ...item, userId: item.papelNaAcao === 'produtor' ? ids.producer : ids.buyer };
      return Object.fromEntries(Object.entries(item).map(([k, v]) => [k, replace(v)]));
    }
    return value;
  };
  const remapped = replace(input) as Record<string, unknown>;
  remapped.comprador = ids.buyer;
  remapped.produtor = ids.producer;
  remapped.linhas = (remapped.linhas as Record<string, unknown>[]).map((l) => ({
    ...l,
    produto: ids.product,
    nome: 'Produto da compra histórica fictícia',
  }));
  return createOrderModel(connection).create(remapped);
}
