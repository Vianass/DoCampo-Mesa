import { randomUUID } from 'node:crypto';
import { Types, mongo } from 'mongoose';
import type { Connection } from 'mongoose';
import { SignJWT, jwtVerify, errors } from 'jose';
import type { AuthConfiguration } from '../../config/auth-environment.js';
import { ApiError } from '../../http/api-error.js';
import { createUserModel } from '../users/user.model.js';
import type { UserRecord, UserRole } from '../users/user.model.js';
import { hashPassword, verifyPassword } from './passwords.js';
import type { z } from 'zod';
import type { credentialsSchema, registrationSchema } from './auth.validation.js';

export interface AuthPrincipal {
  readonly id: string;
  readonly nome: string;
  readonly email: string;
  readonly papeis: readonly UserRole[];
}
function projectUser(
  user: Pick<UserRecord, '_id' | 'nome' | 'emailNormalizado' | 'papeis'>,
): AuthPrincipal {
  return Object.freeze({
    id: user._id.toHexString(),
    nome: user.nome,
    email: user.emailNormalizado,
    papeis: Object.freeze([...user.papeis]),
  });
}
export function unauthorized() {
  return new ApiError(401, 'AUTENTICACAO_INVALIDA', 'Não foi possível autenticar o pedido.');
}
export const registrationAcknowledgement = Object.freeze({
  mensagem: 'Pedido de registo recebido. Tenta iniciar sessão com os dados indicados.',
});

export function createAuthService(
  connection: Connection,
  configuration: AuthConfiguration,
  now: () => Date = () => new Date(),
) {
  const User = createUserModel(connection);
  let preparation: Promise<void> | undefined;
  const prepare = () =>
    (preparation ??= (async () => {
      // O índice único já definido é obrigatório antes de aceitar registos concorrentes.
      await User.createCollection();
      await User.createIndexes();
    })());
  // Uma verificação Argon2 também para emails inexistentes; sem hashes/credenciais fixos.
  let dummyHash: Promise<string> | undefined;
  const dummy = () => (dummyHash ??= hashPassword(randomUUID() + randomUUID()));
  return {
    prepare,
    async register(input: z.infer<typeof registrationSchema>) {
      await prepare();
      const passwordHash = await hashPassword(input.password);
      try {
        await User.create({
          nome: input.nome,
          emailNormalizado: input.email,
          passwordHash,
          papeis: ['comprador'],
          ativo: true,
        });
      } catch (error) {
        if (
          !(error instanceof mongo.MongoServerError) ||
          error.code !== 11000 ||
          !error.keyPattern ||
          Object.keys(error.keyPattern).length !== 1 ||
          error.keyPattern.emailNormalizado !== 1
        )
          throw error;
      }
      return registrationAcknowledgement;
    },
    async login(input: z.infer<typeof credentialsSchema>) {
      const account = await User.findOne({ emailNormalizado: input.email })
        .select('+passwordHash')
        .lean();
      const valid = await verifyPassword(account?.passwordHash ?? (await dummy()), input.password);
      if (!valid || !account || account.ativo === false) throw unauthorized();
      // Releitura após hashing: não emitir um token para uma conta entretanto desativada/alterada.
      const current = await User.findOne({
        _id: account._id,
        ativo: { $ne: false },
        passwordHash: account.passwordHash,
      })
        .select('_id nome emailNormalizado papeis')
        .lean();
      if (!current) throw unauthorized();
      const issuedAt = Math.floor(now().getTime() / 1000);
      const expiresAt = issuedAt + configuration.ttlSeconds;
      const accessToken = await new SignJWT({})
        .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
        .setSubject(current._id.toHexString())
        .setIssuer(configuration.issuer)
        .setAudience(configuration.audience)
        .setIssuedAt(issuedAt)
        .setExpirationTime(expiresAt)
        .setJti(randomUUID())
        .sign(configuration.secret);
      return {
        accessToken,
        tokenType: 'Bearer' as const,
        expiresAt: new Date(expiresAt * 1000).toISOString(),
        utilizador: projectUser(current),
      };
    },
    async authenticate(token: string): Promise<AuthPrincipal> {
      let subject: string;
      try {
        const { payload } = await jwtVerify(token, configuration.secret, {
          algorithms: ['HS256'],
          typ: 'JWT',
          issuer: configuration.issuer,
          audience: configuration.audience,
          requiredClaims: ['sub', 'iat', 'exp', 'jti'],
          maxTokenAge: configuration.ttlSeconds,
          currentDate: now(),
        });
        if (
          typeof payload.sub !== 'string' ||
          !/^[a-f0-9]{24}$/.test(payload.sub) ||
          typeof payload.iat !== 'number' ||
          typeof payload.exp !== 'number' ||
          !Number.isSafeInteger(payload.iat) ||
          !Number.isSafeInteger(payload.exp) ||
          payload.exp <= payload.iat ||
          payload.exp - payload.iat > configuration.ttlSeconds ||
          typeof payload.jti !== 'string' ||
          !/^[a-f0-9-]{36}$/.test(payload.jti)
        )
          throw unauthorized();
        subject = payload.sub;
      } catch (error) {
        if (error instanceof errors.JOSEError || error instanceof ApiError) throw unauthorized();
        throw error;
      }
      const account = await User.findOne({
        _id: new Types.ObjectId(subject),
        ativo: { $ne: false },
      })
        .select('_id nome emailNormalizado papeis')
        .lean();
      if (!account) throw unauthorized();
      return projectUser(account);
    },
  };
}
export type AuthService = ReturnType<typeof createAuthService>;
