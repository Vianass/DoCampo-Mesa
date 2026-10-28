import { z } from 'zod';
import { orderListQuery } from '../orders/orders.validation.js';
import { applicationStatuses } from '../producers/producer.model.js';

const text = (maximum: number) =>
  z
    .string()
    .transform((value) => value.normalize('NFC').trim())
    .pipe(
      z
        .string()
        .min(1)
        .refine((value) => [...value].length <= maximum),
    );

export const applicationInput = z.strictObject({
  nomePublico: text(160),
  localidade: text(120),
  concelho: text(120),
  descricao: text(5000),
  telefone: text(120),
});
export const rejectionInput = z.strictObject({ justificacao: text(2000) });
export const applicationListQuery = orderListQuery.extend({
  estado: z.enum(applicationStatuses).optional(),
});
export type ApplicationInput = z.infer<typeof applicationInput>;
export type ApplicationListQuery = z.infer<typeof applicationListQuery>;
