import { z } from 'zod';
import { orderListQuery, orderParams } from '../orders/orders.validation.js';
import { orderStates, orderPaymentStates } from '../orders/order.constants.js';
const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => {
    const time = Date.parse(v + 'T00:00:00.000Z');
    return (
      Number.isFinite(time) &&
      new Date(time).toISOString().slice(0, 10) === v &&
      v >= '1970-01-01' &&
      v < '9999-12-31'
    );
  });
export const adminOrderQuery = orderListQuery
  .extend({
    estado: z.enum(orderStates).optional(),
    pagamento: z.enum(orderPaymentStates).optional(),
    produtor: orderParams.shape.id.optional(),
    comprador: orderParams.shape.id.optional(),
    identificador: orderParams.shape.id.optional(),
    desde: day.optional(),
    ate: day.optional(),
  })
  .refine((v) => !v.desde || !v.ate || v.desde <= v.ate, {
    path: ['ate'],
    message: 'A data final deve ser igual ou posterior à inicial.',
  });
export const adminOrderHistoryQuery = orderListQuery.extend({
  dominio: z.enum(['operacional', 'pagamento']).default('operacional'),
});
export type AdminOrderQuery = z.infer<typeof adminOrderQuery>;
export type AdminOrderHistoryQuery = z.infer<typeof adminOrderHistoryQuery>;
