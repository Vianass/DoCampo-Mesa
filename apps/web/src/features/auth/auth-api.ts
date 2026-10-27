import { requestJson } from '../api/client';
import { InvalidResponse, objectId } from '../api/catalog-contract';
import { isRole, type AccountUser } from './types';
export interface Credentials {
  email: string;
  password: string;
}
export interface Registration extends Credentials {
  nome: string;
}
export interface LoginResult {
  accessToken: string;
  tokenType: 'Bearer';
  expiresAt: string;
  utilizador: AccountUser;
}
function object(value: unknown): asserts value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new InvalidResponse();
}
function text(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !value.trim()) throw new InvalidResponse();
}
export function parseAccount(value: unknown): AccountUser {
  object(value);
  text(value.id);
  text(value.nome);
  text(value.email);
  if (
    !objectId(value.id) ||
    !Array.isArray(value.papeis) ||
    !value.papeis.length ||
    !value.papeis.every(isRole) ||
    new Set(value.papeis).size !== value.papeis.length
  )
    throw new InvalidResponse();
  return { id: value.id, nome: value.nome, email: value.email, papeis: [...value.papeis] };
}
export function parseLogin(value: unknown): LoginResult {
  object(value);
  text(value.accessToken);
  text(value.expiresAt);
  if (
    value.tokenType !== 'Bearer' ||
    !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value.accessToken) ||
    value.accessToken.length > 2041 ||
    !Number.isFinite(Date.parse(value.expiresAt))
  )
    throw new InvalidResponse();
  return {
    accessToken: value.accessToken,
    tokenType: 'Bearer',
    expiresAt: value.expiresAt,
    utilizador: parseAccount(value.utilizador),
  };
}
export const authApi = {
  register: (body: Registration, signal?: AbortSignal) =>
    requestJson(
      '/auth/register',
      (value) => {
        object(value);
        text(value.mensagem);
        return undefined;
      },
      signal,
      { method: 'POST', body, expectedStatus: 202 },
    ),
  login: (body: Credentials, signal?: AbortSignal) =>
    requestJson('/auth/login', parseLogin, signal, { method: 'POST', body }),
  me: (bearer: string, signal?: AbortSignal) =>
    requestJson('/auth/me', parseAccount, signal, { bearer }),
  logout: (bearer: string, signal?: AbortSignal) =>
    requestJson(
      '/auth/logout',
      (value) => {
        object(value);
        text(value.mensagem);
        if (value.revogado !== false) throw new InvalidResponse();
        return undefined;
      },
      signal,
      { method: 'POST', body: {}, bearer },
    ),
};
export type AuthApi = typeof authApi;
export function authError(error: unknown) {
  const status = error && typeof error === 'object' && 'status' in error ? error.status : undefined;
  if (status === 401) return 'Não foi possível iniciar sessão. Confirma o email e a palavra-passe.';
  if (status === 403) return 'Não tens autorização para concluir este pedido.';
  if (status === 400)
    return 'Revê os dados e a política de palavra-passe antes de tentar novamente.';
  if (status === 429) return 'Foram feitas várias tentativas. Aguarda antes de tentar novamente.';
  return 'O serviço de entrada está temporariamente indisponível. Tenta novamente.';
}
