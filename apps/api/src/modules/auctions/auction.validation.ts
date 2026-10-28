import { z } from 'zod';
import { auctionStates } from './auction.types.js';
import { orderListQuery } from '../orders/orders.validation.js';
const text = (max: number) =>
  z
    .string()
    .transform((s) => s.normalize('NFC').trim())
    .pipe(
      z
        .string()
        .min(1)
        .refine((s) => [...s].length <= max),
    );
const money = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const instant = z.iso.datetime({ offset: true }).transform((s) => new Date(s));
export const auctionEditable = z
  .strictObject({
    titulo: text(180),
    descricao: text(5000),
    precoBaseCent: money,
    incrementoCent: money.refine((n) => n > 0),
    iniciaEm: instant.optional(),
    terminaEm: instant,
  })
  .refine(
    (v) =>
      Number.isSafeInteger(v.precoBaseCent) &&
      Number.isSafeInteger(v.incrementoCent) &&
      BigInt(v.precoBaseCent) + BigInt(v.incrementoCent) <= BigInt(Number.MAX_SAFE_INTEGER),
    { message: 'Preço e incremento excedem a representação segura.' },
  )
  .refine((v) => !v.iniciaEm || v.terminaEm > v.iniciaEm, { message: 'Datas incompatíveis.' });
export const auctionCreate = auctionEditable.safeExtend({
  produtoId: z
    .string()
    .regex(/^[a-fA-F0-9]{24}$/)
    .transform((s) => s.toLowerCase()),
  quantidade: z.number().int().min(1).max(10_000_000),
});
export const auctionQuery = orderListQuery.extend({ estado: z.enum(auctionStates).optional() });
export const bidBody = z.strictObject({ valorCent: money.refine((n) => n > 0) });
export const idempotencyKey = z.string().regex(/^[\x21-\x7e]{1,128}$/);
export type AuctionCreate = z.infer<typeof auctionCreate>;
export type AuctionEdit = z.infer<typeof auctionEditable>;
export type AuctionQuery = z.infer<typeof auctionQuery>;
