import { Types, mongo, type Connection, type ClientSession } from 'mongoose';
import { ApiError } from '../../http/api-error.js';
import { unauthorized, type AuthPrincipal } from '../auth/auth.service.js';
import { createUserModel, type UserRecord } from '../users/user.model.js';
import {
  operationalRevision,
  revisionCondition,
  ConcurrencyError,
} from '../concurrency/concurrency-error.js';
import { createAccountAuditModel, createAdminGuardModel } from './admin.models.js';
import { adminUserDto, adminUserTag, type ManagedUser } from './admin.serialization.js';
import {
  accountStateInput,
  type AdminUserQuery,
  type AccountStateInput,
} from './admin.validation.js';
import type { OrderListQuery } from '../orders/orders.validation.js';
import { catalogPattern } from '../catalog/catalog.validation.js';
const forbidden = () => new ApiError(403, 'ACESSO_PROIBIDO', 'Não tens acesso a esta operação.');
const missing = () =>
  new ApiError(404, 'UTILIZADOR_NAO_ENCONTRADO', 'O utilizador não está disponível.');
const conflict = () =>
  new ApiError(
    409,
    'ESTADO_CONFLITO',
    'A conta mudou ou já tem esse estado. Consulta-a antes de continuar.',
  );
const projection = '_id nome emailNormalizado papeis ativo createdAt updatedAt revisaoOperacional';
export function createAdminService(connection: Connection, key: Uint8Array) {
  if (key.byteLength < 32) throw Error('Chave administrativa inválida.');
  const User = createUserModel(connection),
    Audit = createAccountAuditModel(connection),
    Guard = createAdminGuardModel(connection);
  let preparation: Promise<void> | undefined;
  const prepare = () =>
    (preparation ??= (async () => {
      for (const model of [User, Audit, Guard]) {
        await model.createCollection();
        await model.createIndexes();
      }
      await Guard.updateOne(
        { _id: 'account-state' },
        { $setOnInsert: { revisao: 0 } },
        { upsert: true },
      );
    })());
  async function admin(principal: AuthPrincipal, session?: ClientSession, fence = false) {
    const user = await User.findById(principal.id)
      .select('_id papeis ativo revisaoOperacional')
      .session(session ?? null)
      .lean();
    if (!user || user.ativo === false) throw unauthorized();
    if (!user.papeis.includes('administrador')) throw forbidden();
    if (fence) {
      const result = await User.collection.updateOne(
        {
          _id: user._id,
          ativo: { $ne: false },
          papeis: 'administrador',
          ...revisionCondition(operationalRevision(user.revisaoOperacional)),
        },
        { $inc: { revisaoOperacional: 1 } },
        { session },
      );
      if (result.matchedCount !== 1) throw conflict();
    }
    return user;
  }
  async function transaction<T>(work: (session: ClientSession) => Promise<T>) {
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
          timeoutMS: 10000,
        },
      );
    } catch (error) {
      if (error instanceof ApiError) throw error;
      if (
        error instanceof ConcurrencyError ||
        (error instanceof mongo.MongoServerError && error.code === 11000)
      )
        throw conflict();
      if (
        error instanceof mongo.MongoNetworkError ||
        error instanceof mongo.MongoOperationTimeoutError ||
        error instanceof mongo.MongoServerSelectionError ||
        (error instanceof mongo.MongoServerError &&
          (error.code === 112 ||
            error.code === 50 ||
            error.hasErrorLabel('UnknownTransactionCommitResult') ||
            error.hasErrorLabel('TransientTransactionError')))
      )
        throw new ApiError(
          503,
          'RESULTADO_INDETERMINADO',
          'Não foi possível confirmar o resultado. Consulta o estado antes de repetir.',
        );
      throw error;
    } finally {
      await session.endSession();
    }
  }
  async function user(id: string, session?: ClientSession) {
    if (!/^[a-fA-F0-9]{24}$/.test(id)) throw missing();
    const value = await User.findById(id)
      .select(projection)
      .session(session ?? null)
      .lean();
    if (!value) throw missing();
    return value;
  }
  async function detailBody(value: ManagedUser, session?: ClientSession) {
    const approved =
      value.papeis.includes('produtor') &&
      !!(await connection
        .db!.collection('producers')
        .findOne(
          { userId: value._id, 'aprovacao.estado': 'aprovado' },
          { session, projection: { _id: 1 } },
        ));
    return {
      ...adminUserDto(value),
      capacidades: {
        comprar: value.ativo !== false && value.papeis.includes('comprador'),
        vender: value.ativo !== false && approved,
        administrar: value.ativo !== false && value.papeis.includes('administrador'),
      },
    };
  }
  function match(value: ManagedUser, tag?: string) {
    if (!tag) throw new ApiError(428, 'PRECONDICAO_OBRIGATORIA', 'Envia o ETag atual em If-Match.');
    if (!/^"[A-Za-z0-9_-]{43}"$/.test(tag))
      throw new ApiError(
        400,
        'IF_MATCH_INVALIDO',
        'Envia um único ETag forte recebido do servidor.',
      );
    if (tag !== adminUserTag(value, key))
      throw new ApiError(
        412,
        'PRECONDICAO_FALHOU',
        'A conta mudou. Consulta-a antes de continuar.',
      );
  }
  async function page<T>(
    collection: string,
    stages: Record<string, unknown>[],
    query: OrderListQuery,
    itemProjection: Record<string, unknown>,
    session?: ClientSession,
  ) {
    const [result] = await connection
      .db!.collection(collection)
      .aggregate<{ itens: T[]; contagem: { total: number }[] }>(
        [
          ...stages,
          {
            $sort: {
              [collection === 'users' ? 'createdAt' : 'ocorridoEm']:
                query.ordem === 'antigas' ? 1 : -1,
              _id: 1,
            },
          },
          {
            $facet: {
              itens: [
                { $skip: (query.pagina - 1) * query.porPagina },
                { $limit: query.porPagina },
                { $project: itemProjection },
              ],
              contagem: [{ $count: 'total' }],
            },
          },
        ],
        { session, maxTimeMS: 2000 },
      )
      .toArray();
    const total = result?.contagem[0]?.total ?? 0;
    return {
      itens: result?.itens ?? [],
      total,
      pagina: query.pagina,
      porPagina: query.porPagina,
      totalPaginas: Math.ceil(total / query.porPagina),
    };
  }
  return {
    prepare,
    async dashboard(principal: AuthPrincipal) {
      return transaction(async (session) => {
        await admin(principal, session);
        async function count(collection: string, stages: Record<string, unknown>[] = []) {
          const rows = await connection
            .db!.collection(collection)
            .aggregate<{ total: number }>([...stages, { $count: 'total' }], {
              session,
              maxTimeMS: 2000,
            })
            .toArray();
          return rows[0]?.total ?? 0;
        }
        const totalUtilizadores = await count('users');
        const compradoresAtivos = await count('users', [
          { $match: { papeis: 'comprador', ativo: { $ne: false } } },
        ]);
        const approved = [
          { $match: { 'aprovacao.estado': 'aprovado' } },
          {
            $lookup: {
              from: 'users',
              localField: 'userId',
              foreignField: '_id',
              pipeline: [
                { $match: { ativo: { $ne: false }, papeis: 'produtor' } },
                { $project: { _id: 1 } },
              ],
              as: 'conta',
            },
          },
          { $match: { 'conta.0': { $exists: true } } },
        ];
        const produtoresAprovados = await count('producers', approved);
        const candidaturasPendentes = await count('producers', [
          { $match: { 'aprovacao.estado': 'pendente' } },
        ]);
        const produtosPublicados = await count('products', [
          { $match: { estadoPublicacao: 'publicado' } },
          {
            $lookup: {
              from: 'producers',
              localField: 'produtor',
              foreignField: 'userId',
              pipeline: approved,
              as: 'perfil',
            },
          },
          { $match: { 'perfil.0': { $exists: true } } },
        ]);
        const encomendas = await count('orders');
        const leiloesAtivos = await count('auctions', [
          {
            $match: {
              estado: { $in: ['ativo', 'agendado'] },
              $expr: { $and: [{ $lte: ['$iniciaEm', '$$NOW'] }, { $gt: ['$terminaEm', '$$NOW'] }] },
            },
          },
        ]);
        return {
          observadoEm: new Date().toISOString(),
          totalUtilizadores,
          compradoresAtivos,
          produtoresAprovados,
          candidaturasPendentes,
          produtosPublicados,
          encomendas,
          leiloesAtivos,
        };
      });
    },
    async list(principal: AuthPrincipal, query: AdminUserQuery) {
      await admin(principal);
      const filter: Record<string, unknown> = {};
      if (query.estado) filter.ativo = query.estado === 'ativo' ? { $ne: false } : false;
      if (query.papel) filter.papeis = query.papel;
      if (query.pesquisa)
        filter.$or = ['nome', 'emailNormalizado'].map((field) => ({
          [field]: { $regex: catalogPattern(query.pesquisa!), $options: 'i' },
        }));
      const result = await page<ManagedUser>('users', [{ $match: filter }], query, {
        _id: 1,
        nome: 1,
        emailNormalizado: 1,
        papeis: 1,
        ativo: 1,
        createdAt: 1,
      });
      return { ...result, itens: result.itens.map(adminUserDto) };
    },
    async detail(principal: AuthPrincipal, id: string) {
      await admin(principal);
      const value = await user(id);
      return { body: await detailBody(value), etag: adminUserTag(value, key) };
    },
    async audit(principal: AuthPrincipal, id: string, query: OrderListQuery) {
      await admin(principal);
      await user(id);
      const result = await page<{
        _id: Types.ObjectId;
        administradorId: Types.ObjectId;
        ativoAnterior: boolean;
        ativoAtual: boolean;
        motivo: string;
        ocorridoEm: Date;
      }>('user_state_audit', [{ $match: { utilizadorId: new Types.ObjectId(id) } }], query, {
        _id: 1,
        administradorId: 1,
        ativoAnterior: 1,
        ativoAtual: 1,
        motivo: 1,
        ocorridoEm: 1,
      });
      return {
        ...result,
        itens: result.itens.map((row) => ({
          id: row._id.toHexString(),
          administradorId: row.administradorId.toHexString(),
          ativoAnterior: row.ativoAnterior,
          ativoAtual: row.ativoAtual,
          motivo: row.motivo,
          ocorridoEm: row.ocorridoEm.toISOString(),
        })),
      };
    },
    async changeState(
      principal: AuthPrincipal,
      id: string,
      input: AccountStateInput,
      tag?: string,
    ) {
      const parsed = accountStateInput.safeParse(input);
      if (!parsed.success)
        throw new ApiError(400, 'DADOS_INVALIDOS', 'Verifica o estado e o motivo.');
      return transaction(async (session) => {
        // A escrita comum impede write skew na contagem do último administrador.
        const guard = await Guard.updateOne(
          { _id: 'account-state' },
          { $inc: { revisao: 1 } },
          { session },
        );
        if (guard.matchedCount !== 1) throw conflict();
        await admin(principal, session);
        const value = await user(id, session);
        match(value, tag);
        if (id.toLowerCase() === principal.id && !input.ativo)
          throw new ApiError(
            409,
            'AUTODESATIVACAO_PROIBIDA',
            'Não podes desativar a tua própria conta.',
          );
        if ((value.ativo !== false) === parsed.data.ativo) throw conflict();
        if (!parsed.data.ativo && value.papeis.includes('administrador')) {
          const active = await User.countDocuments({
            papeis: 'administrador',
            ativo: { $ne: false },
          }).session(session);
          if (active <= 1)
            throw new ApiError(
              409,
              'ULTIMO_ADMINISTRADOR',
              'É necessário preservar um administrador ativo.',
            );
        }
        await admin(principal, session, true);
        const revision = operationalRevision(value.revisaoOperacional),
          time = new Date();
        const updated = await connection.db!.collection<UserRecord>('users').findOneAndUpdate(
          { _id: value._id, ...revisionCondition(revision) },
          { $set: { ativo: parsed.data.ativo, updatedAt: time }, $inc: { revisaoOperacional: 1 } },
          {
            session,
            returnDocument: 'after',
            includeResultMetadata: false,
            projection: {
              _id: 1,
              nome: 1,
              emailNormalizado: 1,
              papeis: 1,
              ativo: 1,
              createdAt: 1,
              updatedAt: 1,
              revisaoOperacional: 1,
            },
          },
        );
        if (!updated) throw conflict();
        await Audit.create(
          [
            {
              utilizadorId: value._id,
              administradorId: new Types.ObjectId(principal.id),
              ativoAnterior: value.ativo !== false,
              ativoAtual: parsed.data.ativo,
              motivo: parsed.data.motivo,
              ocorridoEm: time,
              revisao: revision + 1,
            },
          ],
          { session },
        );
        return { body: await detailBody(updated, session), etag: adminUserTag(updated, key) };
      });
    },
  };
}
export type AdminService = ReturnType<typeof createAdminService>;
