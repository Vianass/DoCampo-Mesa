import { randomBytes } from 'node:crypto';
import { createConnection } from 'mongoose';
import { afterAll, describe, expect, it } from 'vitest';
import { hash as bcryptHash } from 'bcryptjs';
import argon2 from 'argon2';
import { parseAuthEnvironment } from '../../src/config/auth-environment.js';
import { registrationSchema, credentialsSchema } from '../../src/modules/auth/auth.validation.js';
import { hashPassword, verifyPassword } from '../../src/modules/auth/passwords.js';
import { createAuthService } from '../../src/modules/auth/auth.service.js';
import { createUserModel } from '../../src/modules/users/user.model.js';
import {
  authConfiguration,
  authTestPassword,
  authToken,
  registrationInput,
} from '../support/auth-fixtures.js';

const connection = createConnection();
afterAll(() => connection.close());
describe('configuração de autenticação', () => {
  it.each([undefined, '', 'exemplo', '*'.repeat(43), 'a'.repeat(43)])(
    'recusa segredo inválido sem o revelar: %s',
    (secret) => {
      try {
        parseAuthEnvironment({ JWT_SECRET: secret });
        throw Error('Expected rejection');
      } catch (error) {
        expect(error).toMatchObject({ name: 'ConfigurationError', campos: ['JWT_SECRET'] });
        expect(String(error)).not.toContain(secret || 'exemplo');
      }
    },
  );
  it.each(['*', 'https://site.invalid/path', 'null', 'file:///tmp'])(
    'recusa origem inválida %s',
    (origin) => {
      expect(() =>
        parseAuthEnvironment({
          JWT_SECRET: randomBytes(32).toString('base64url'),
          CORS_ORIGINS: origin,
        }),
      ).toThrow();
    },
  );
  it('não permite origens HTTP nem proxies genéricos em produção', () => {
    const secret = randomBytes(32).toString('base64url');
    expect(() =>
      parseAuthEnvironment({
        JWT_SECRET: secret,
        NODE_ENV: 'production',
        CORS_ORIGINS: 'http://localhost:5173',
      }),
    ).toThrow();
    expect(() => parseAuthEnvironment({ JWT_SECRET: secret, TRUSTED_PROXY_IPS: 'true' })).toThrow();
    expect(
      parseAuthEnvironment({
        JWT_SECRET: secret,
        NODE_ENV: 'production',
        CORS_ORIGINS: 'https://site.invalid',
        TRUSTED_PROXY_IPS: '127.0.0.1,::1',
      }).trustedProxies,
    ).toEqual(['127.0.0.1', '::1']);
  });
  it.each(['0', '1', '3601', 'NaN'])('recusa duração inválida %s', (ttl) => {
    expect(() =>
      parseAuthEnvironment({
        JWT_SECRET: randomBytes(32).toString('base64url'),
        JWT_TTL_SECONDS: ttl,
      }),
    ).toThrow();
  });
});
describe('entradas e passwords', () => {
  it('normaliza nome/email sem modificar a password', () => {
    const input = registrationInput();
    const parsed = registrationSchema.parse({
      ...input,
      nome: ' Jose\u0301 ',
      email: ' ALIAS+Teste@EXAMPLE.INVALID ',
      password: '  Uma frase comprida com espaços  ',
    });
    expect(parsed.nome).toBe('José');
    expect(parsed.email).toBe('alias+teste@example.invalid');
    expect(parsed.password).toBe('  Uma frase comprida com espaços  ');
  });
  it.each([
    'curta',
    'x'.repeat(129),
    'senha\u0000com caracteres inválidos',
    'senha com surrogate \uD800',
  ])('recusa password inválida no registo', (password) => {
    expect(registrationSchema.safeParse({ ...registrationInput(), password }).success).toBe(false);
  });
  it.each([
    { papel: 'administrador' },
    { papeis: ['administrador'] },
    { ativo: true },
    { passwordHash: 'privado' },
    { userId: 'DEMO_ADMIN' },
  ])('recusa atribuição de campos protegidos', (extra) => {
    expect(registrationSchema.safeParse({ ...registrationInput(), ...extra }).success).toBe(false);
  });
  it('permite autenticar passwords antigas mais curtas sem relaxar o registo', () => {
    expect(
      credentialsSchema.safeParse({ email: 'antigo@example.invalid', password: 'antiga' }).success,
    ).toBe(true);
  });
  it('Argon2id usa salt aleatório e verifica sem guardar texto simples', async () => {
    const first = await hashPassword(authTestPassword);
    const second = await hashPassword(authTestPassword);
    expect(first).toMatch(/^\$argon2id\$v=19\$/);
    expect(argon2.needsRehash(first, { memoryCost: 19456, timeCost: 2, parallelism: 1 })).toBe(
      false,
    );
    expect(first).not.toBe(second);
    expect(first).not.toContain(authTestPassword);
    expect(await verifyPassword(first, authTestPassword)).toBe(true);
    const reordered = first.replace(/\$m=19456,p=1,t=2\$/, '$t=2,m=19456,p=1$');
    expect(await verifyPassword(reordered, authTestPassword)).toBe(true);
    expect(await verifyPassword(first, 'outra frase diferente')).toBe(false);
    const User = createUserModel(connection);
    await expect(
      new User({
        nome: 'Teste',
        emailNormalizado: 'argon@example.invalid',
        passwordHash: first,
        papeis: ['comprador'],
      }).validate(),
    ).resolves.toBeUndefined();
  });
  it('verifica bcrypt antigo e rejeita truncagem acima de 72 bytes', async () => {
    const hash = await bcryptHash('a'.repeat(72), 4);
    expect(await verifyPassword(hash, 'a'.repeat(72))).toBe(true);
    expect(await verifyPassword(hash, 'a'.repeat(72) + 'outra')).toBe(false);
    expect(await verifyPassword('texto-simples', 'texto-simples')).toBe(false);
  });
});
describe('JWT rejeitado antes de consultar a base de dados', () => {
  it.each([
    'expirado',
    'adulterado',
    'issuer',
    'audience',
    'futuro',
    'sub',
    'jti',
    'duracao',
    'algoritmo',
  ] as const)('recusa token %s', async (mode) => {
    const config = authConfiguration({ secret: randomBytes(64) });
    const service = createAuthService(connection, config);
    const now = Math.floor(Date.now() / 1000);
    const claims: Record<string, unknown> = {};
    if (mode === 'expirado') Object.assign(claims, { iat: now - 1800, exp: now - 1 });
    if (mode === 'issuer') claims.iss = 'outra-api';
    if (mode === 'audience') claims.aud = 'outro-cliente';
    if (mode === 'futuro') claims.iat = now + 60;
    if (mode === 'sub') claims.sub = 'DEMO_ADMIN';
    if (mode === 'jti') claims.jti = '';
    if (mode === 'duracao') claims.exp = now + 7200;
    let token = await authToken(
      config,
      '000000000000000000000011',
      claims,
      mode === 'algoritmo' ? 'HS384' : 'HS256',
    );
    if (mode === 'adulterado') token = token.slice(0, -8) + 'AAAAAAAA';
    await expect(service.authenticate(token)).rejects.toMatchObject({
      status: 401,
      codigo: 'AUTENTICACAO_INVALIDA',
    });
  });
});
