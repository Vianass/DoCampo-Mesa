import { z } from 'zod';
import { applicationInput } from '../producer-applications/producer-application.validation.js';
import { validateProducerCommercial } from './producer-commercial.validation.js';
import { producerPaymentMethods } from './producer-commercial.constants.js';

const text = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine((v) => !/[\p{Cc}\p{Cs}]/u.test(v));
const period = z.strictObject({
  diaSemana: z.number().int().min(1).max(7),
  inicio: text(5),
  fim: text(5),
});
export const commercialInput = z
  .strictObject({
    localLevantamento: text(4096).optional(),
    modalidades: z.strictObject({ levantamento: z.boolean(), entrega: z.boolean() }),
    taxaEntregaCent: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).optional(),
    concelhosEntregaIds: z.array(text(120)).max(400),
    catalogoConcelhosVersao: text(120).optional(),
    disponibilidade: z.strictObject({
      fusoHorario: text(100),
      levantamento: z.array(period).max(28),
      entrega: z.array(period).max(28),
    }),
    metodosPagamento: z.array(z.enum(producerPaymentMethods)).min(1).max(3),
    pagamentoPrivado: z
      .strictObject({
        mbWay: z.strictObject({ contacto: text(120) }).optional(),
        transferenciaBancaria: z
          .strictObject({
            iban: text(100).transform((v) => v.replaceAll(' ', '').toUpperCase()),
            titular: text(200).optional(),
          })
          .optional(),
      })
      .optional(),
  })
  .superRefine((v, ctx) => {
    for (const issue of validateProducerCommercial(v))
      ctx.addIssue({
        code: 'custom',
        path: issue.campo.replace(/^comercial\./, '').split('.'),
        message: issue.mensagem,
      });
    if (v.modalidades.levantamento && !v.localLevantamento)
      ctx.addIssue({
        code: 'custom',
        path: ['localLevantamento'],
        message: 'Indica o local de levantamento.',
      });
  });
export const profileInput = applicationInput.extend({
  imagem: z
    .strictObject({
      url: z
        .url()
        .max(4096)
        .refine((v) => {
          const u = new URL(v);
          return ['http:', 'https:'].includes(u.protocol) && !u.username && !u.password;
        }),
      alt: text(500).optional(),
    })
    .optional(),
  comercial: commercialInput.nullable(),
});
export type ProfileInput = z.infer<typeof profileInput>;
