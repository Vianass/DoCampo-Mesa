import { createHmac } from 'node:crypto';
import { Types, type ClientSession, type Connection } from 'mongoose';
import { ApiError } from '../../http/api-error.js';
import { unauthorized, type AuthPrincipal } from '../auth/auth.service.js';
import { operationalRevision, revisionCondition } from '../concurrency/concurrency-error.js';
import type { UserRecord, UserRole } from '../users/user.model.js';

/** Guarda persistida usada pela moderação existente e pelos novos agregados. */
export async function moderationAccount(
  connection: Connection,
  p: AuthPrincipal,
  role?: UserRole,
  session?: ClientSession,
  fence = false,
) {
  const users = connection.db!.collection<UserRecord>('users'),
    id = new Types.ObjectId(p.id);
  const u = await users.findOne(
    { _id: id },
    {
      session,
      projection: { _id: 1, papeis: 1, ativo: 1, revisaoOperacional: 1 },
      maxTimeMS: 5000,
    },
  );
  if (!u || u.ativo === false) throw unauthorized();
  if (
    role
      ? !u.papeis.includes(role)
      : !u.papeis.some((r) => ['comprador', 'produtor', 'administrador'].includes(r))
  )
    throw new ApiError(403, 'ACESSO_PROIBIDO', 'Não tens acesso a esta operação.');
  if (fence) {
    const result = await users.updateOne(
      {
        _id: id,
        ativo: { $ne: false },
        ...(role ? { papeis: role } : {}),
        ...revisionCondition(operationalRevision(u.revisaoOperacional)),
      },
      { $inc: { revisaoOperacional: 1 } },
      { session },
    );
    if (result.matchedCount !== 1)
      throw new ApiError(409, 'CONFLITO_REVISAO', 'O acesso mudou. Consulta novamente.');
  }
  return id;
}
export const moderationTag = (key: Uint8Array, value: string) =>
  '"' + createHmac('sha256', key).update(value).digest('base64url') + '"';
export function requireModerationTag(current: string, value?: string) {
  if (!value) throw new ApiError(428, 'PRECONDICAO_OBRIGATORIA', 'Envia o ETag atual em If-Match.');
  if (!/^"[A-Za-z0-9_-]{43}"$/.test(value))
    throw new ApiError(400, 'IF_MATCH_INVALIDO', 'Envia um único ETag forte.');
  if (current !== value)
    throw new ApiError(
      412,
      'PRECONDICAO_FALHOU',
      'O conteúdo mudou. Consulta o estado atualizado antes de decidir.',
    );
}
