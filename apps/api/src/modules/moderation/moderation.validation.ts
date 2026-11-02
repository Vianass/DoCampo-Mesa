import { z } from 'zod';
import { catalogId } from '../catalog/catalog.validation.js';
import { orderListQuery } from '../orders/orders.validation.js';
import { reviewText } from '../reviews/review.validation.js';
import { visibilityStates } from './moderation.types.js';
export const reportTargets = ['produto', 'produtor', 'avaliacao'] as const;
export const reportStates = ['pendente', 'resolvida', 'rejeitada'] as const;
export const contentKinds = ['produto', 'produtor'] as const;
export const reportInput = z.strictObject({
  alvoTipo: z.enum(reportTargets),
  alvoId: catalogId,
  motivo: reviewText(1000),
});
export const reportLookup = z.strictObject({ alvoTipo: z.enum(reportTargets), alvoId: catalogId });
export const reportQuery = orderListQuery.extend({
  estado: z.enum(reportStates).optional(),
  alvoTipo: z.enum(reportTargets).optional(),
  identificador: catalogId.optional(),
});
export const reportDecision = z.strictObject({
  estado: z.enum(['resolvida', 'rejeitada']),
  motivo: reviewText(2000),
});
export const contentQuery = orderListQuery.extend({
  tipo: z.enum(contentKinds),
  estado: z.enum(visibilityStates).optional(),
  identificador: catalogId.optional(),
  sinalizados: z.enum(['true', 'false']).optional(),
});
export const contentParams = z.strictObject({ tipo: z.enum(contentKinds), id: catalogId });
export const contentDecision = z.strictObject({
  estado: z.enum(visibilityStates),
  motivo: reviewText(2000),
});
const image = z.strictObject({
  url: z
    .url()
    .max(4096)
    .refine((value) => {
      const u = new URL(value);
      return ['http:', 'https:'].includes(u.protocol) && !u.username && !u.password;
    }),
  alt: z.string().max(500).optional(),
});
export const evidenceSchema = z.strictObject({
  nome: z.string().min(1).max(300),
  descricao: z.string().max(10000),
  imagens: z.array(image).max(2),
  ingredientes: z.array(z.string().max(500)).max(100).optional(),
  etiquetas: z.array(z.string().max(300)).max(100).optional(),
  modoProducao: z.string().max(300).optional(),
  classificacao: z.number().int().min(1).max(5).optional(),
});
export type ReportInput = z.infer<typeof reportInput>;
export type ReportQuery = z.infer<typeof reportQuery>;
export type ContentQuery = z.infer<typeof contentQuery>;
