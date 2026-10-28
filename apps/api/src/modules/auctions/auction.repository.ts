import { createHmac } from 'node:crypto';
import { Error as MongooseError, Types, mongo } from 'mongoose';
import type { ClientSession, Connection } from 'mongoose';
import { ApiError } from '../../http/api-error.js';
import { guardUserCapabilities, UserCapabilityError } from '../users/user-capability.repository.js';
import type { UserRole } from '../users/user.model.js';
import type { ProducerRecord } from '../producers/producer.model.js';
import {
  operationalRevision,
  revisionCondition,
  ConcurrencyError,
} from '../concurrency/concurrency-error.js';
import { isCheckoutReadUnavailable } from '../orders/checkout.idempotency.js';
import { createAuctionModel } from './auction.model.js';
import { createBidModel } from './bid.model.js';
import type { AuctionRecord } from './auction.types.js';
import type { BidRecord } from './bid.types.js';

export function createAuctionRepository(connection: Connection, key: Buffer | string) {
  const Auction = createAuctionModel(connection),
    Bid = createBidModel(connection);
  const auctions = () => connection.db!.collection<AuctionRecord>('auctions'),
    bids = () => connection.db!.collection<BidRecord>('bids');
  function tag(a: AuctionRecord) {
    return (
      '"' +
      createHmac('sha256', key).update(`auction-v1:${a._id}:${a.versao}`).digest('base64url') +
      '"'
    );
  }
  function participant(a: AuctionRecord, buyer: Types.ObjectId) {
    return (
      'p_' +
      createHmac('sha256', key)
        .update(`auction-participant-v1:${a._id}:${buyer}`)
        .digest('base64url')
        .slice(0, 24)
    );
  }
  function match(a: AuctionRecord, header?: string) {
    if (!header)
      throw new ApiError(428, 'PRECONDICAO_OBRIGATORIA', 'Envia o ETag atual em If-Match.');
    if (!/^"[A-Za-z0-9_-]{43}"$/.test(header))
      throw new ApiError(400, 'IF_MATCH_INVALIDO', 'Envia um único ETag forte.');
    if (tag(a) !== header)
      throw new ApiError(412, 'PRECONDICAO_FALHOU', 'O leilão mudou. Consulta-o antes de repetir.');
  }
  async function clock(
    collection: 'users' | 'auctions',
    id: Types.ObjectId,
    session?: ClientSession,
  ) {
    const row = await connection
      .db!.collection(collection)
      .aggregate<{ agora: Date }>(
        [{ $match: { _id: id } }, { $project: { _id: 0, agora: '$$NOW' } }],
        { ...(session ? { session } : {}), maxTimeMS: 5000 },
      )
      .next();
    if (!row) throw new ApiError(404, 'RECURSO_NAO_ENCONTRADO', 'O recurso não está disponível.');
    return row.agora;
  }
  async function guardUsers(
    entries: { id: Types.ObjectId; roles: UserRole[] }[],
    session: ClientSession,
  ) {
    for (const actor of [...entries].sort((a, b) =>
      a.id.toHexString().localeCompare(b.id.toHexString()),
    ))
      await guardUserCapabilities(connection, actor.id, actor.roles, session);
  }
  async function guardProfile(id: Types.ObjectId, session: ClientSession) {
    const profiles = connection.db!.collection<ProducerRecord>('producers');
    const profile = await profiles.findOne(
      { userId: id, 'aprovacao.estado': 'aprovado' },
      { session },
    );
    if (!profile)
      throw new ApiError(
        403,
        'PRODUTOR_INELEGIVEL',
        'A produção não está disponível para esta operação.',
      );
    const changed = await profiles.findOneAndUpdate(
      {
        _id: profile._id,
        userId: id,
        'aprovacao.estado': 'aprovado',
        ...revisionCondition(operationalRevision(profile.revisaoOperacional)),
      },
      { $inc: { revisaoOperacional: 1 } },
      { session, returnDocument: 'after', includeResultMetadata: false, projection: { _id: 1 } },
    );
    if (!changed) throw new ConcurrencyError('CONFLITO_VERSAO', 'O perfil mudou.');
    return profile;
  }
  async function transaction<T>(work: (session: ClientSession) => Promise<T>): Promise<T> {
    const session = await connection.startSession();
    let executions = 0;
    const deadline = Date.now() + 10000;
    try {
      for (;;) {
        try {
          return await session.withTransaction(
            async () => {
              if (++executions > 8 || Date.now() >= deadline)
                throw new ApiError(
                  503,
                  'RESULTADO_DESCONHECIDO',
                  'Não foi possível confirmar o resultado. Consulta ou repete com a mesma chave.',
                );
              return work(session);
            },
            {
              readConcern: { level: 'snapshot' },
              writeConcern: { w: 'majority' },
              readPreference: 'primary',
              timeoutMS: Math.max(1, deadline - Date.now()),
            },
          );
        } catch (error) {
          if (
            error instanceof mongo.MongoServerError &&
            error.code === 11000 &&
            executions < 8 &&
            Date.now() < deadline
          )
            continue;
          throw error;
        }
      }
    } catch (error) {
      if (error instanceof UserCapabilityError)
        throw new ApiError(
          403,
          'ACESSO_PROIBIDO',
          'As capacidades necessárias já não estão disponíveis.',
        );
      if (error instanceof ConcurrencyError)
        throw new ApiError(
          409,
          'CONFLITO_REVISAO',
          'O recurso mudou ou deixou de estar elegível. Consulta-o antes de repetir.',
        );
      if (
        error instanceof MongooseError.ValidationError ||
        error instanceof MongooseError.CastError
      )
        throw new ApiError(400, 'PEDIDO_INVALIDO', 'Verifica os campos e as condições do leilão.');
      if (isCheckoutReadUnavailable(error))
        throw new ApiError(
          503,
          'RESULTADO_DESCONHECIDO',
          'Não foi possível confirmar o resultado. Consulta ou repete com a mesma chave.',
        );
      throw error;
    } finally {
      await session.endSession();
    }
  }
  async function read<T>(operation: () => Promise<T>) {
    try {
      return await operation();
    } catch (error) {
      if (isCheckoutReadUnavailable(error))
        throw new ApiError(
          503,
          'SERVICO_INDISPONIVEL',
          'Os leilões estão temporariamente indisponíveis.',
        );
      throw error;
    }
  }
  return {
    Auction,
    Bid,
    auctions,
    bids,
    clock,
    guardUsers,
    guardProfile,
    transaction,
    read,
    tag,
    participant,
    match,
    async prepare() {
      await Auction.createCollection();
      await Auction.createIndexes();
      await Bid.createCollection();
      await Bid.createIndexes();
    },
  };
}
export type AuctionRepository = ReturnType<typeof createAuctionRepository>;
