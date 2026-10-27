import { z } from 'zod';
import { orderStates } from './order.constants.js';
import { orderListQuery } from './orders.validation.js';
import type { OrderState } from './order.types.js';

// O02/OR01: o produtor não confirma a receção pelo comprador (O13).
const nextStates: Partial<Record<OrderState, OrderState>> = {
  pendente: 'confirmada',
  confirmada: 'em_preparacao',
  em_preparacao: 'pronta',
};
export function producerTransitions(state: OrderState): OrderState[] {
  const next = nextStates[state];
  return next ? [next] : [];
}
export const producerOrderQuery = orderListQuery.extend({ estado: z.enum(orderStates).optional() });
export const producerStatusBody = z.strictObject({ estado: z.enum(orderStates) });
export type ProducerOrderQuery = z.infer<typeof producerOrderQuery>;
