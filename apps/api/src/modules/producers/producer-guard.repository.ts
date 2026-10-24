import { Types } from 'mongoose';
import type { ClientSession, Connection } from 'mongoose';
import {
  ConcurrencyError,
  operationalRevision,
  revisionCondition,
} from '../concurrency/concurrency-error.js';
import { operationDatabase, requireOperationSession } from '../concurrency/operation-session.js';
import { validateProducerGuardCandidate } from './producer-eligibility.js';
import type { ProducerEligibilityRecord, ProducerGuardInput } from './producer-eligibility.js';

/** Escrita real de guarda; não inicia/termina transações nem devolve dados privados. */
export async function guardProducerEligibility(
  connection: Connection,
  input: ProducerGuardInput,
  session: ClientSession,
) {
  requireOperationSession(session, true);
  if (!input || !(input.produtorId instanceof Types.ObjectId))
    throw new ConcurrencyError('VALIDACAO', 'Identificador de produtor inválido.');
  revisionCondition(input.revisaoEsperada);
  const collection =
    operationDatabase(connection).collection<ProducerEligibilityRecord>('producers');
  const projection = {
    _id: 1,
    userId: 1,
    revisaoOperacional: 1,
    'aprovacao.estado': 1,
    'comercial.modalidades': 1,
    'comercial.taxaEntregaCent': 1,
    'comercial.concelhosEntregaIds': 1,
    'comercial.catalogoConcelhosVersao': 1,
    'comercial.disponibilidade': 1,
    'comercial.metodosPagamento': 1,
  };
  const record = await collection.findOne({ userId: input.produtorId }, { session, projection });
  validateProducerGuardCandidate(record, input);
  if (!record?.comercial) throw new Error('Validação interna de produtor inconsistente.');
  const selection = input.selecao;
  const result = await collection.findOneAndUpdate(
    {
      _id: record._id,
      userId: input.produtorId,
      ...revisionCondition(input.revisaoEsperada),
      'aprovacao.estado': 'aprovado',
      ['comercial.modalidades.' + selection.modalidade]: true,
      'comercial.metodosPagamento': selection.metodoPagamento,
      'comercial.disponibilidade': record.comercial.disponibilidade,
      ...(selection.modalidade === 'entrega'
        ? {
            'comercial.concelhosEntregaIds': selection.concelhoId,
            'comercial.taxaEntregaCent': selection.taxaEntregaAceiteCent,
          }
        : {}),
    },
    { $inc: { revisaoOperacional: 1 } },
    {
      session,
      returnDocument: 'after',
      includeResultMetadata: false,
      projection: { _id: 1, revisaoOperacional: 1 },
    },
  );
  if (!result)
    throw new ConcurrencyError('CONFLITO_VERSAO', 'A guarda encontrou uma alteração concorrente.');
  return {
    produtorId: input.produtorId,
    revisaoOperacional: operationalRevision(result.revisaoOperacional),
  };
}
