import { z } from 'zod';
import { orderStates } from '../modules/orders/order.constants.js';
import type { Reply, RealtimeError } from './auction.protocol.js';
export const orderWatchInput = z.strictObject({});
export const orderUpdate = z.strictObject({
  encomendaId: z.string().regex(/^[a-f0-9]{24}$/),
  estado: z.enum(orderStates),
  versao: z.number().int().nonnegative().safe(),
  atualizadaEm: z.iso.datetime(),
});
export type OrderUpdate = z.infer<typeof orderUpdate>;
export interface OrderClientEvents {
  'orders:watch': (v: Record<string, never>, ack: (r: Reply<{ consultar: true }>) => void) => void;
}
export interface OrderServerEvents {
  'order:updated': (v: OrderUpdate) => void;
  'orders:error': (v: RealtimeError) => void;
}
