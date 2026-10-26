import { isIP } from 'node:net';
import { z } from 'zod';
import { ConfigurationError } from './environment.js';

const origin = z.string().refine((value) => {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && url.origin === value;
  } catch {
    return false;
  }
});
const csv = (value: string | undefined) =>
  value ? value.split(',').map((item) => item.trim()) : [];
const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    JWT_SECRET: z
      .string()
      .regex(/^[A-Za-z0-9_-]{43,128}$/)
      .refine((value) => {
        const bytes = Buffer.from(value, 'base64url');
        return bytes.length >= 32 && bytes.toString('base64url') === value;
      }),
    JWT_ISSUER: z.string().min(1).max(128).default('docampo-api'),
    JWT_AUDIENCE: z.string().min(1).max(128).default('docampo-web'),
    JWT_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(900),
    CORS_ORIGINS: z.string().optional().transform(csv).pipe(z.array(origin)),
    TRUSTED_PROXY_IPS: z
      .string()
      .optional()
      .transform(csv)
      .pipe(z.array(z.string().refine((value) => isIP(value) !== 0))),
  })
  .superRefine((value, context) => {
    if (
      value.NODE_ENV === 'production' &&
      value.CORS_ORIGINS.some((item) => !item.startsWith('https://'))
    )
      context.addIssue({ code: 'custom', path: ['CORS_ORIGINS'], message: 'HTTPS obrigatório.' });
  });

export function parseAuthEnvironment(environment: NodeJS.ProcessEnv = process.env) {
  const parsed = schema.safeParse(environment);
  if (!parsed.success)
    throw new ConfigurationError(parsed.error.issues.map((issue) => issue.path.join('.')));
  const value = parsed.data;
  return {
    secret: Buffer.from(value.JWT_SECRET, 'base64url'),
    issuer: value.JWT_ISSUER,
    audience: value.JWT_AUDIENCE,
    ttlSeconds: value.JWT_TTL_SECONDS,
    allowedOrigins: value.CORS_ORIGINS,
    trustedProxies: value.TRUSTED_PROXY_IPS,
    production: value.NODE_ENV === 'production',
  };
}
export type AuthConfiguration = ReturnType<typeof parseAuthEnvironment>;
