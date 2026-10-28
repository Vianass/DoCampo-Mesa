import {
  Error as MongooseError,
  Types,
  mongo,
  type ClientSession,
  type Connection,
} from 'mongoose';
import { ApiError } from '../../http/api-error.js';
import { unauthorized, type AuthPrincipal } from '../auth/auth.service.js';
import {
  ConcurrencyError,
  operationalRevision,
  revisionCondition,
} from '../concurrency/concurrency-error.js';
import { createProducerModel } from '../producers/producer.model.js';
import { createUserModel, type UserRole } from '../users/user.model.js';
import {
  applicationDto,
  applicationTag,
  rejectedSnapshot,
} from './producer-application.serialization.js';
import type { ApplicationInput, ApplicationListQuery } from './producer-application.validation.js';

const privateFields =
  '+telefone +aprovacao.decisao.autor +historicoCandidaturas +comercial.pagamentoPrivado';
const conflict = () =>
  new ApiError(
    409,
    'CANDIDATURA_CONFLITO',
    'A candidatura já foi submetida ou decidida. Consulta o estado atual.',
  );
const forbidden = () => new ApiError(403, 'ACESSO_PROIBIDO', 'Não tens acesso a esta operação.');
const notFound = () =>
  new ApiError(404, 'CANDIDATURA_NAO_ENCONTRADA', 'Candidatura não encontrada.');

export function createProducerApplicationService(connection: Connection, key: Uint8Array) {
  if (key.byteLength < 32) throw new Error('Chave interna de candidaturas inválida.');
  const Producer = createProducerModel(connection),
    User = createUserModel(connection);
  let preparation: Promise<void> | undefined;
  const prepare = () =>
    (preparation ??= (async () => {
      for (const model of [User, Producer]) {
        await model.createCollection();
        await model.createIndexes();
      }
    })());

  /** Revalida na base de dados; a principal do pedido nunca é fonte de novos privilégios. */
  async function account(
    id: string,
    scope: 'self' | 'admin' | 'candidate',
    session?: ClientSession,
  ) {
    const query = User.findById(id).select('_id papeis ativo revisaoOperacional');
    if (session) query.session(session);
    const user = await query.lean();
    if (!user || user.ativo === false) {
      if (scope === 'candidate')
        throw new ApiError(
          409,
          'CANDIDATO_INELEGIVEL',
          'A conta candidata já não está disponível para esta decisão.',
        );
      throw unauthorized();
    }
    if (scope === 'admin' && !user.papeis.includes('administrador')) throw forbidden();
    if (session) {
      // Fence na mesma revisão utilizada por checkout/leilões/alterações de conta.
      const result = await User.collection.updateOne(
        {
          _id: user._id,
          ativo: { $ne: false },
          ...(scope === 'admin' ? { papeis: 'administrador' as UserRole } : {}),
          ...revisionCondition(operationalRevision(user.revisaoOperacional)),
        },
        { $inc: { revisaoOperacional: 1 } },
        { session },
      );
      if (result.matchedCount !== 1) throw conflict();
    }
    return user;
  }

  async function transaction<T>(work: (session: ClientSession) => Promise<T>): Promise<T> {
    await prepare();
    const session = await connection.startSession();
    let attempts = 0;
    try {
      return await session.withTransaction(
        async () => {
          if (++attempts > 3) throw conflict();
          return work(session);
        },
        {
          readConcern: { level: 'snapshot' },
          writeConcern: { w: 'majority' },
          readPreference: 'primary',
          timeoutMS: 10_000,
        },
      );
    } catch (error) {
      if (error instanceof ApiError) throw error;
      if (
        error instanceof ConcurrencyError ||
        (error instanceof mongo.MongoServerError && error.code === 11000)
      )
        throw conflict();
      if (error instanceof MongooseError.ValidationError)
        throw new ApiError(400, 'CANDIDATURA_INVALIDA', 'Verifica os dados da candidatura.');
      if (error instanceof mongo.MongoServerError && error.code === 10334)
        throw new ApiError(
          413,
          'HISTORICO_DEMASIADO_GRANDE',
          'O histórico atingiu o limite de armazenamento. Contacta a administração.',
        );
      if (
        error instanceof mongo.MongoNetworkError ||
        error instanceof mongo.MongoServerSelectionError ||
        error instanceof mongo.MongoOperationTimeoutError ||
        (error instanceof mongo.MongoServerError &&
          (error.code === 50 ||
            error.code === 112 ||
            error.hasErrorLabel('UnknownTransactionCommitResult') ||
            error.hasErrorLabel('TransientTransactionError')))
      )
        throw new ApiError(
          503,
          'RESULTADO_INDETERMINADO',
          'Não foi possível confirmar o resultado. Consulta a candidatura antes de repetir.',
        );
      throw error;
    } finally {
      await session.endSession();
    }
  }
  function result(record: Parameters<typeof applicationDto>[0], admin: boolean) {
    return { body: applicationDto(record, admin), etag: applicationTag(record, key) };
  }
  function match(record: Parameters<typeof applicationDto>[0], tag: string | undefined) {
    if (!tag) throw new ApiError(428, 'PRECONDICAO_OBRIGATORIA', 'Envia o ETag atual em If-Match.');
    if (!/^"[A-Za-z0-9_-]{43}"$/.test(tag))
      throw new ApiError(
        400,
        'IF_MATCH_INVALIDO',
        'Envia um único ETag forte recebido do servidor.',
      );
    if (applicationTag(record, key) !== tag)
      throw new ApiError(
        412,
        'PRECONDICAO_FALHOU',
        'A candidatura mudou. Consulta-a antes de decidir.',
      );
  }
  return {
    prepare,
    async submit(user: AuthPrincipal, input: ApplicationInput) {
      return transaction(async (session) => {
        await account(user.id, 'self', session);
        let record = await Producer.findOne({ userId: new Types.ObjectId(user.id) })
          .select(privateFields)
          .session(session);
        if (record) {
          if (record.aprovacao.estado !== 'rejeitado') throw conflict();
          const previous = rejectedSnapshot(record);
          record.historicoCandidaturas = [...(record.historicoCandidaturas ?? []), previous];
          record.set(input);
          record.aprovacao = {
            estado: 'pendente',
            submetidaEm: new Date(Math.max(Date.now(), previous.decisao.data.getTime() + 1)),
          };
        } else {
          record = new Producer({
            ...input,
            userId: new Types.ObjectId(user.id),
            aprovacao: { estado: 'pendente', submetidaEm: new Date() },
          });
        }
        await record.save({ session });
        return result(record.toObject({ transform: false }), false);
      });
    },
    async self(user: AuthPrincipal) {
      await account(user.id, 'self');
      const record = await Producer.findOne({ userId: new Types.ObjectId(user.id) })
        .select(privateFields)
        .lean();
      if (!record) throw notFound();
      return result(record, false);
    },
    async list(user: AuthPrincipal, query: ApplicationListQuery) {
      await account(user.id, 'admin');
      const filter = query.estado ? { 'aprovacao.estado': query.estado } : {};
      const sort: Record<string, 1 | -1> = {
        'aprovacao.submetidaEm': query.ordem === 'recentes' ? -1 : 1,
        _id: 1,
      };
      // Uma única agregação conserva a coerência da página e da contagem.
      const [page] = await Producer.aggregate<{
        itens: {
          _id: Types.ObjectId;
          userId: Types.ObjectId;
          nomePublico: string;
          aprovacao: { estado: string; submetidaEm: Date };
        }[];
        contagem: { total: number }[];
      }>([
        { $match: filter },
        { $sort: sort },
        {
          $facet: {
            itens: [
              { $skip: (query.pagina - 1) * query.porPagina },
              { $limit: query.porPagina },
              {
                $project: {
                  _id: 1,
                  userId: 1,
                  nomePublico: 1,
                  'aprovacao.estado': 1,
                  'aprovacao.submetidaEm': 1,
                },
              },
            ],
            contagem: [{ $count: 'total' }],
          },
        },
      ]);
      const total = page?.contagem[0]?.total ?? 0;
      return {
        itens: (page?.itens ?? []).map((row) => ({
          id: row._id.toHexString(),
          utilizadorId: row.userId.toHexString(),
          nomePublico: row.nomePublico,
          estado: row.aprovacao.estado,
          submetidaEm: row.aprovacao.submetidaEm.toISOString(),
        })),
        pagina: query.pagina,
        porPagina: query.porPagina,
        total,
        totalPaginas: Math.ceil(total / query.porPagina),
      };
    },
    async detail(user: AuthPrincipal, id: string) {
      await account(user.id, 'admin');
      const record = await Producer.findById(id).select(privateFields).lean();
      if (!record) throw notFound();
      return result(record, true);
    },
    async decide(
      user: AuthPrincipal,
      id: string,
      outcome: 'aprovado' | 'rejeitado',
      tag: string | undefined,
      justificacao?: string,
    ) {
      return transaction(async (session) => {
        await account(user.id, 'admin', session);
        const record = await Producer.findById(id).select(privateFields).session(session);
        if (!record) throw notFound();
        match(record, tag);
        if (record.aprovacao.estado !== 'pendente') throw conflict();
        const candidate = await account(record.userId.toHexString(), 'candidate', session);
        if (outcome === 'rejeitado' && !justificacao?.trim())
          throw new ApiError(400, 'CANDIDATURA_INVALIDA', 'A rejeição exige uma justificação.');
        record.aprovacao.estado = outcome;
        record.aprovacao.decisao = {
          autor: new Types.ObjectId(user.id),
          data: new Date(Math.max(Date.now(), record.aprovacao.submetidaEm.getTime())),
          ...(outcome === 'rejeitado' ? { justificacao } : {}),
        };
        await record.save({ session });
        if (outcome === 'aprovado') {
          const updated = await User.collection.updateOne(
            { _id: candidate._id, ativo: { $ne: false } },
            { $addToSet: { papeis: 'produtor' }, $inc: { revisaoOperacional: 1 } },
            { session },
          );
          if (updated.matchedCount !== 1) throw conflict();
        }
        return result(record.toObject({ transform: false }), true);
      });
    },
  };
}
export type ProducerApplicationService = ReturnType<typeof createProducerApplicationService>;
