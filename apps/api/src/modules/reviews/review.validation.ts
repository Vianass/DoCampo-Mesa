import { z } from 'zod';
import { catalogId } from '../catalog/catalog.validation.js';
import { orderListQuery } from '../orders/orders.validation.js';
export const reviewStates = ['publicada', 'oculta'] as const;
export const reviewTargets = ['produto', 'produtor'] as const;
export const reviewText = (max: number) =>
  z
    .string()
    .transform((v) => v.normalize('NFC').trim())
    .refine(
      (v) =>
        [...v].length >= 1 &&
        [...v].length <= max &&
        ![...v].some(
          (c) => /\p{Cs}/u.test(c) || (/\p{Cc}/u.test(c) && !['\n', '\r', '\t'].includes(c)),
        ),
    );
const common = {
  encomendaId: catalogId,
  classificacao: z.number().int().min(1).max(5),
  comentario: reviewText(1000),
};
export const reviewCreateInput = z.discriminatedUnion('alvoTipo', [
  z.strictObject({ ...common, alvoTipo: z.literal('produto'), produtoId: catalogId }),
  z.strictObject({ ...common, alvoTipo: z.literal('produtor') }),
]);
export const reviewPublicQuery = orderListQuery;
export const reviewAdminQuery = orderListQuery.extend({
  estado: z.enum(reviewStates).optional(),
  classificacao: z.enum(['1', '2', '3', '4', '5']).transform(Number).optional(),
  produto: catalogId.optional(),
  produtor: catalogId.optional(),
  identificador: catalogId.optional(),
  alvoTipo: z.enum(reviewTargets).optional(),
});
export const reviewDecisionInput = z.strictObject({
  estado: z.enum(reviewStates),
  motivo: reviewText(2000),
});
export type ReviewCreateInput = z.infer<typeof reviewCreateInput>;
export type ReviewAdminQuery = z.infer<typeof reviewAdminQuery>;
export type ReviewDecisionInput = z.infer<typeof reviewDecisionInput>;
