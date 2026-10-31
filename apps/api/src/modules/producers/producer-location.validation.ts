import { z } from 'zod';
/** Apenas o ponto voluntariamente autorizado; nunca inferido do endereço de entrega. */
export const publicLocationInput = z.strictObject({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  descricao: z
    .string()
    .transform((v) => v.normalize('NFC').trim())
    .pipe(
      z
        .string()
        .min(1)
        .max(200)
        .refine((v) => !/[\p{Cc}\p{Cs}]/u.test(v)),
    ),
  autorizada: z.literal(true),
});
export type ProducerPublicLocation = z.infer<typeof publicLocationInput>;
