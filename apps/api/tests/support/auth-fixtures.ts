import { randomBytes, randomUUID } from 'node:crypto';
import { SignJWT } from 'jose';
import { parseAuthEnvironment } from '../../src/config/auth-environment.js';
import type { AuthConfiguration } from '../../src/config/auth-environment.js';

export const authTestPassword = 'Uma frase fictícia para testes!';
export function authConfiguration(overrides: Partial<AuthConfiguration> = {}): AuthConfiguration {
  return {
    ...parseAuthEnvironment({
      NODE_ENV: 'test',
      JWT_SECRET: randomBytes(32).toString('base64url'),
      CORS_ORIGINS: 'http://localhost:5173',
    }),
    ...overrides,
  };
}
export function registrationInput() {
  return {
    nome: 'Pessoa fictícia',
    email: randomUUID() + '@example.invalid',
    password: authTestPassword,
  };
}
/** Apenas assinatura de fixtures: não cria sessões reais fora da base de testes. */
export function authToken(
  config: AuthConfiguration,
  subject: string,
  claims: Record<string, unknown> = {},
  algorithm = 'HS256',
) {
  const time = Math.floor(Date.now() / 1000);
  return new SignJWT({
    sub: subject,
    iss: config.issuer,
    aud: config.audience,
    iat: time,
    exp: time + config.ttlSeconds,
    jti: randomUUID(),
    ...claims,
  })
    .setProtectedHeader({ alg: algorithm, typ: 'JWT' })
    .sign(config.secret);
}
