import { z } from 'zod';

export const orderParams = z.strictObject({
  id: z
    .string()
    .regex(/^[a-fA-F0-9]{24}$/)
    .transform((id) => id.toLowerCase()),
});
export const emptyOrderQuery = z.strictObject({});
export const orderListQuery = z.strictObject({
  pagina: z
    .string()
    .regex(/^[1-9]\d{0,3}$/)
    .transform(Number)
    .refine((page) => page <= 1000)
    .default(1),
  porPagina: z.enum(['12', '24', '36']).transform(Number).default(12),
  ordem: z.enum(['recentes', 'antigas']).default('recentes'),
});
export type OrderListQuery = z.infer<typeof orderListQuery>;
