import { z } from 'zod';
import { orderListQuery, orderParams } from '../orders/orders.validation.js';
import { auctionStates } from '../auctions/auction.types.js';
const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => {
    const t = Date.parse(v + 'T00:00:00Z');
    return (
      Number.isFinite(t) &&
      new Date(t).toISOString().slice(0, 10) === v &&
      v >= '1970-01-01' &&
      v < '9999-12-31'
    );
  });
export const adminAuctionQuery = orderListQuery
  .extend({
    estado: z.enum(auctionStates).optional(),
    produtor: orderParams.shape.id.optional(),
    produto: orderParams.shape.id.optional(),
    identificador: orderParams.shape.id.optional(),
    desde: day.optional(),
    ate: day.optional(),
  })
  .refine((v) => !v.desde || !v.ate || v.desde <= v.ate, {
    path: ['ate'],
    message: 'Revê o intervalo de início do leilão.',
  });
export type AdminAuctionQuery = z.infer<typeof adminAuctionQuery>;
