import { z } from 'zod';
import { orderListQuery } from '../orders/orders.validation.js';
import { rejectionInput } from '../producer-applications/producer-application.validation.js';
import { userRoles } from '../users/user.model.js';
export const adminUserQuery = orderListQuery.extend({
  pesquisa: z
    .string()
    .transform((v) => v.normalize('NFC').trim())
    .pipe(z.string().min(1).max(100))
    .optional(),
  estado: z.enum(['ativo', 'inativo']).optional(),
  papel: z.enum(userRoles).optional(),
});
export const accountStateInput = z.strictObject({
  ativo: z.boolean(),
  motivo: rejectionInput.shape.justificacao,
});
export type AdminUserQuery = z.infer<typeof adminUserQuery>;
export type AccountStateInput = z.infer<typeof accountStateInput>;
