import type { Connection } from 'mongoose';
import { checkoutScenario, checkoutTestNow, seedCheckoutScenario } from './checkout-fixtures.js';
import { createOrdersService } from '../../src/modules/orders/orders.service.js';
import { createProducerOrdersService } from '../../src/modules/orders/producer-orders.service.js';
import type { AuthPrincipal } from '../../src/modules/auth/auth.service.js';
import type { OrderState } from '../../src/modules/orders/order.types.js';
/** Compra fictícia realmente criada por checkout e preparada pelo produtor; nunca cria concluida. */
export async function receiptScenario(
  connection: Connection,
  key: Uint8Array,
  state: OrderState = 'pronta',
  delivery = false,
) {
  const s = await seedCheckoutScenario(connection, checkoutScenario(1, delivery)),
    buyer: AuthPrincipal = {
      id: s.buyerId.toHexString(),
      nome: 'Comprador fictício',
      email: 'buyer@example.invalid',
      papeis: ['comprador'],
    },
    producer: AuthPrincipal = {
      id: s.producers[0]!.userId.toHexString(),
      nome: 'Produtor fictício',
      email: 'producer@example.invalid',
      papeis: ['produtor'],
    },
    orders = createOrdersService(connection, { now: () => checkoutTestNow }),
    producers = createProducerOrdersService(connection, Buffer.from(key));
  await orders.prepare();
  const purchase = await orders.checkout(buyer, s.chave, s.pedido);
  if (purchase.status !== 201 || !('encomendas' in purchase.body))
    throw Error('Checkout de teste não criado.');
  const id = purchase.body.encomendas[0]!.orderId;
  for (const target of ['confirmada', 'em_preparacao', 'pronta'] as const) {
    if (state === 'pendente') break;
    const current = await producers.detail(producer, id);
    await producers.status(producer, id, target, current.etag);
    if (target === state) break;
  }
  return { s, buyer, producer, id, orders, producers };
}
