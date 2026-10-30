import { createHmac } from 'node:crypto';
import type { UserRecord } from '../users/user.model.js';
export type ManagedUser = Pick<
  UserRecord,
  | '_id'
  | 'nome'
  | 'emailNormalizado'
  | 'papeis'
  | 'ativo'
  | 'createdAt'
  | 'updatedAt'
  | 'revisaoOperacional'
>;
export function adminUserDto(user: ManagedUser) {
  return {
    id: user._id.toHexString(),
    nome: user.nome,
    email: user.emailNormalizado,
    papeis: [...user.papeis],
    ativo: user.ativo !== false,
    registadoEm: user.createdAt.toISOString(),
  };
}
export function adminUserTag(user: ManagedUser, key: Uint8Array) {
  return (
    '"' +
    createHmac('sha256', key)
      .update(
        JSON.stringify([
          'admin-user-state',
          user._id.toHexString(),
          user.revisaoOperacional ?? 0,
          user.ativo !== false,
          user.papeis,
        ]),
      )
      .digest('base64url') +
    '"'
  );
}
