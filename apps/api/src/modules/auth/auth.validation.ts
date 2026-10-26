import { z } from 'zod';

export const normalizedEmail = z.string().trim().toLowerCase().pipe(z.email().max(254));
const validPasswordText = z
  .string()
  .refine(
    (value) =>
      [...value].length <= 128 &&
      Buffer.byteLength(value, 'utf8') <= 512 &&
      !value.includes('\0') &&
      !/\p{Cs}/u.test(value),
  );
export const registrationSchema = z.strictObject({
  nome: z
    .string()
    .transform((value) => value.normalize('NFC').trim())
    .refine(
      (value) =>
        [...value].length >= 1 && [...value].length <= 120 && !/[\p{Cc}\p{Cs}]/u.test(value),
    ),
  email: normalizedEmail,
  password: validPasswordText.refine((value) => [...value].length >= 15),
});
export const credentialsSchema = z.strictObject({
  email: normalizedEmail,
  password: validPasswordText.refine((value) => value.length >= 1),
});
export const emptyQuerySchema = z.strictObject({});
