import { Types } from 'mongoose';
import type { ClientSession, Connection } from 'mongoose';
import {
  ConcurrencyError,
  operationalRevision,
  revisionCondition,
} from '../concurrency/concurrency-error.js';
import { operationDatabase, requireOperationSession } from '../concurrency/operation-session.js';
import type { UserRecord, UserRole } from './user.model.js';

export class UserCapabilityError extends Error {
  readonly codigo = 'CAPACIDADE_INDISPONIVEL';
  constructor() {
    super('A conta não tem as capacidades necessárias para esta operação.');
    this.name = 'UserCapabilityError';
  }
}

/** Guarda fechada de papéis já existentes, sem criar estados de suspensão ou autenticação. */
export async function guardUserCapabilities(
  connection: Connection,
  contaId: Types.ObjectId,
  papeis: readonly UserRole[],
  session: ClientSession,
): Promise<void> {
  requireOperationSession(session, true);
  if (
    !(contaId instanceof Types.ObjectId) ||
    !papeis.length ||
    papeis.some((role) => !['comprador', 'produtor'].includes(role))
  )
    throw new ConcurrencyError('VALIDACAO', 'Guarda de conta inválida.');
  const users = operationDatabase(connection).collection<UserRecord>('users');
  const record = await users.findOne(
    { _id: contaId },
    {
      session,
      projection: { _id: 1, papeis: 1, revisaoOperacional: 1 },
    },
  );
  if (!record || !papeis.every((role) => record.papeis.includes(role)))
    throw new UserCapabilityError();
  const revision = operationalRevision(record.revisaoOperacional);
  const result = await users.findOneAndUpdate(
    {
      _id: contaId,
      papeis: { $all: [...papeis] },
      ...revisionCondition(revision),
    },
    { $inc: { revisaoOperacional: 1 } },
    {
      session,
      returnDocument: 'after',
      includeResultMetadata: false,
      projection: { _id: 1 },
    },
  );
  if (!result) throw new ConcurrencyError('CONFLITO_VERSAO', 'As capacidades da conta mudaram.');
}
