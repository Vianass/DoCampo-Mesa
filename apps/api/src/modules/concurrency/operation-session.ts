import { mongo } from 'mongoose';
import type { ClientSession, Connection } from 'mongoose';
import { ConcurrencyError } from './concurrency-error.js';

export function requireOperationSession(
  session: ClientSession | undefined,
  required: boolean,
): void {
  if (session === undefined && !required) return;
  if (!(session instanceof mongo.ClientSession) || session.hasEnded || !session.inTransaction()) {
    throw new ConcurrencyError(
      'TRANSACAO_OBRIGATORIA',
      'É necessária uma sessão explícita com transação ativa.',
    );
  }
}

export function operationDatabase(connection: Connection) {
  if (connection.readyState !== 1 || !connection.db)
    throw new Error('Ligação de persistência indisponível.');
  return connection.db;
}
