import { Types, mongo } from 'mongoose';
import type { OrderRecord } from '../../src/modules/orders/order.types.js';
import { validateCheckoutInput } from '../../src/modules/orders/checkout.validation.js';
import {
  identifyCheckout,
  prepareCheckoutIdempotency,
} from '../../src/modules/orders/checkout.idempotency.js';
import { homeDelivery, orderFixtureBuyer, orderInput } from './order-fixtures.js';

export function cloneCheckoutFixture<T>(value: T): T {
  return mongo.BSON.deserialize(mongo.BSON.serialize({ value })).value as T;
}

/** Apenas dados fictícios; não liga a MongoDB nem guarda encomendas. */
export function checkoutIdempotencyFixture(
  count: 1 | 2 = 2,
  key?: string,
  delivered = false,
  buyer = orderFixtureBuyer,
) {
  const ids = Array.from({ length: count }, () => new Types.ObjectId());
  const operation = 'operacao-ficticia-' + ids[0]!.toHexString();
  const producers = ['000000000000000000000012', '000000000000000000000022'].slice(0, count);
  const products = ['000000000000000000000013', '000000000000000000000023'].slice(0, count);
  const input = validateCheckoutInput(
    { compradorContaId: buyer.toHexString() },
    key ?? 'chave-ficticia-' + ids[0]!.toHexString(),
    {
      linhas: producers.map((owner, i) => ({
        produtoId: products[i],
        produtorContaId: owner,
        quantidade: 500,
        ofertaAceite: {
          precoReferenciaCent: 150,
          revisaoProdutoObservada: 0,
          unidadeVenda: {
            modalidade: 'peso',
            unidadeBase: 'g',
            quantidadeReferencia: 1000,
            quantidadeMinima: 250,
            incrementoCompra: 50,
          },
        },
      })),
      condicoesPorProdutor: producers.map((owner) => ({
        produtorContaId: owner,
        modalidade: delivered ? 'entrega' : 'levantamento',
        metodoPagamento: 'dinheiro',
        taxaEntregaAceiteCent: delivered ? 250 : 0,
        revisaoProdutorObservada: 0,
        periodo: {
          inicioEm: '2026-10-23T09:00:00Z',
          fimEm: '2026-10-23T11:00:00Z',
          fusoHorario: 'Europe/Lisbon',
        },
        ...(delivered
          ? {
              concelhoId: 'concelho-ficticio',
              morada: 'Morada fictícia privada',
              contacto: 'Contacto fictício privado',
            }
          : {}),
      })),
    },
  );
  const orders = producers.map((owner, i) => {
    const raw = orderInput('pendente', {
      _id: ids[i],
      operacaoCompraId: operation,
      produtor: new Types.ObjectId(owner),
      comprador: buyer,
    });
    const record = raw as unknown as OrderRecord;
    return {
      ...record,
      linhas: record.linhas.map((line) => ({ ...line, produto: new Types.ObjectId(products[i]!) })),
      historicoEstado: record.historicoEstado.map((event) => ({
        ...event,
        ator: { tipo: 'utilizador' as const, userId: buyer, papelNaAcao: 'comprador' as const },
      })),
      pagamento: {
        ...record.pagamento,
        historico: record.pagamento.historico.map((event) => ({
          ...event,
          ator: { tipo: 'utilizador' as const, userId: buyer, papelNaAcao: 'comprador' as const },
        })),
      },
      ...(delivered ? { entrega: homeDelivery(), taxaEntregaCent: 250, totalCent: 325 } : {}),
    } as OrderRecord;
  });
  const plan = prepareCheckoutIdempotency(input, orders);
  const members = orders.map((order) =>
    order._id.equals(plan.ancoraOrderId)
      ? { ...order, idempotencia: cloneCheckoutFixture(plan.idempotencia) }
      : order,
  );
  const anchor = members.find((order) => order._id.equals(plan.ancoraOrderId))!;
  return { input, orders, plan, members, anchor, expected: identifyCheckout(input) };
}
