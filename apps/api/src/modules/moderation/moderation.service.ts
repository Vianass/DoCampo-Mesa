import {
  Types,
  mongo,
  Error as MongooseError,
  type Connection,
  type ClientSession,
} from 'mongoose';
import { ApiError } from '../../http/api-error.js';
import type { AuthPrincipal } from '../auth/auth.service.js';
import type { ProductRecord } from '../products/product.types.js';
import type { ProducerRecord } from '../producers/producer.model.js';
import type { ReviewRecord } from '../reviews/review.types.js';
import { createContentReportModel } from './content-report.model.js';
import { moderationAccount, moderationTag, requireModerationTag } from './moderation.control.js';
import { operationalRevision, revisionCondition } from '../concurrency/concurrency-error.js';
import { isCheckoutReadUnavailable } from '../orders/checkout.idempotency.js';
import {
  evidenceSchema,
  reportInput,
  reportDecision,
  contentDecision,
  type ReportInput,
  type ReportQuery,
  type ContentQuery,
} from './moderation.validation.js';
import type {
  ContentEvidence,
  ContentReport,
  ContentVisibility,
  ReportTarget,
} from './moderation.types.js';
import type { OrderListQuery } from '../orders/orders.validation.js';

const missing = () =>
  new ApiError(404, 'CONTEUDO_NAO_ENCONTRADO', 'O conteúdo não está disponível.');
export function createModerationService(connection: Connection, key: Uint8Array) {
  const Report = createContentReportModel(connection),
    db = connection.db!;
  const reports = () => db.collection<ContentReport>('content_reports');
  let ready: Promise<void> | undefined;
  const prepare = () =>
    (ready ??= (async () => {
      await Report.createCollection();
      await Report.createIndexes();
    })());
  async function transaction<T>(work: (session: ClientSession) => Promise<T>): Promise<T> {
    await prepare();
    const session = await connection.startSession();
    let attempts = 0;
    try {
      return await session.withTransaction(
        async () => {
          if (++attempts > 5)
            throw new ApiError(
              409,
              'CONFLITO_REVISAO',
              'Os dados mudaram. Consulta antes de repetir.',
            );
          return work(session);
        },
        {
          readConcern: { level: 'snapshot' },
          writeConcern: { w: 'majority' },
          readPreference: 'primary',
          timeoutMS: 10000,
        },
      );
    } catch (e) {
      if (e instanceof ApiError) throw e;
      if (e instanceof mongo.MongoServerError && e.code === 11000)
        throw new ApiError(
          409,
          'DENUNCIA_DUPLICADA',
          'Já denunciaste este conteúdo. Consulta o resultado antes de repetir.',
        );
      if (e instanceof MongooseError.ValidationError || e instanceof MongooseError.CastError)
        throw new ApiError(400, 'PEDIDO_INVALIDO', 'Revê os campos do pedido.');
      if (isCheckoutReadUnavailable(e))
        throw new ApiError(
          503,
          'RESULTADO_INDETERMINADO',
          'Não foi possível confirmar o resultado. Consulta o estado antes de repetir.',
        );
      throw e;
    } finally {
      await session.endSession();
    }
  }
  async function target(
    kind: ReportTarget,
    id: string,
    session: ClientSession,
    publiclyAvailable = false,
  ) {
    const _id = new Types.ObjectId(id),
      options = { session, maxTimeMS: 5000, projection: { 'moderacao.historico': 0 } };
    if (kind === 'avaliacao') {
      const r = await db.collection<ReviewRecord>('reviews').findOne({ _id }, options);
      if (!r || (publiclyAvailable && r.estado !== 'publicada')) throw missing();
      if (publiclyAvailable) {
        const p = await db.collection<ProducerRecord>('producers').findOne(
          {
            _id: r.perfilProdutor,
            'moderacao.estado': { $ne: 'oculta' },
            'aprovacao.estado': 'aprovado',
          },
          options,
        );
        if (
          !p ||
          !(await db
            .collection('users')
            .findOne({ _id: p.userId, ativo: { $ne: false }, papeis: 'produtor' }, options))
        )
          throw missing();
        if (
          r.produto &&
          !(await db.collection('products').findOne(
            {
              _id: r.produto,
              estadoPublicacao: 'publicado',
              'moderacao.estado': { $ne: 'oculta' },
            },
            options,
          ))
        )
          throw missing();
      }
      return {
        id,
        tipo: kind,
        evidencia: evidenceSchema.parse({
          nome: r.alvoNome,
          descricao: r.comentario,
          imagens: [],
          classificacao: r.classificacao,
        }),
        estadoModeracao: r.estado === 'oculta' ? ('oculta' as const) : ('visivel' as const),
        versao: r.versao,
        etag: moderationTag(key, `report-review-v1:${id}:${r.versao}:${r.estado}`),
        estadoComercial: null,
        perfilId: r.perfilProdutor.toHexString(),
      };
    }
    const row =
      kind === 'produto'
        ? await db.collection<ProductRecord>('products').findOne({ _id }, options)
        : await db.collection<ProducerRecord>('producers').findOne({ _id }, options);
    if (!row) throw missing();
    const visibility = row.moderacao,
      state = visibility?.estado ?? 'visivel';
    const product = kind === 'produto' ? (row as ProductRecord) : undefined;
    const producer = kind === 'produtor' ? (row as ProducerRecord) : undefined;
    if (publiclyAvailable) {
      const profile =
        producer ??
        (await db
          .collection<ProducerRecord>('producers')
          .findOne({ userId: product!.produtor }, options));
      if (
        state !== 'visivel' ||
        (product && product.estadoPublicacao !== 'publicado') ||
        !profile ||
        profile.moderacao?.estado === 'oculta' ||
        profile.aprovacao.estado !== 'aprovado'
      )
        throw missing();
      if (
        !(await db
          .collection('users')
          .findOne({ _id: profile.userId, ativo: { $ne: false }, papeis: 'produtor' }, options))
      )
        throw missing();
    }
    const evidence: ContentEvidence = product
      ? {
          nome: product.nome,
          descricao: product.descricao ?? '',
          imagens: product.imagens.map(({ url, alt }) => ({ url, ...(alt ? { alt } : {}) })),
          ingredientes: product.ingredientes,
          etiquetas: product.etiquetas,
          ...(product.modoProducao ? { modoProducao: product.modoProducao } : {}),
        }
      : {
          nome: producer!.nomePublico,
          descricao: producer!.descricao,
          imagens: producer!.imagem ? [producer!.imagem] : [],
        };
    return {
      id,
      tipo: kind,
      evidencia: evidenceSchema.parse(evidence),
      estadoModeracao: state,
      versao: visibility?.versao ?? 0,
      etag: moderationTag(
        key,
        `content-v1:${kind}:${id}:${operationalRevision(row.revisaoOperacional)}:${visibility?.versao ?? 0}:${state}`,
      ),
      estadoComercial: product ? product.estadoPublicacao : producer!.aprovacao.estado,
      perfilId: producer?._id.toHexString() ?? null,
    };
  }
  async function report(id: string, session: ClientSession) {
    const r = await reports().findOne(
      { _id: new Types.ObjectId(id) },
      { session, maxTimeMS: 5000 },
    );
    if (!r) throw new ApiError(404, 'DENUNCIA_NAO_ENCONTRADA', 'A denúncia não está disponível.');
    return r;
  }
  function ownDto(r: ContentReport) {
    return {
      id: r._id.toHexString(),
      alvoTipo: r.alvoTipo,
      alvoId: r.alvoId.toHexString(),
      motivo: r.motivo,
      estado: r.estado,
      criadaEm: r.createdAt.toISOString(),
      atualizadaEm: r.updatedAt.toISOString(),
    };
  }
  function adminDto(r: ContentReport) {
    return {
      ...ownDto(r),
      autorId: r.autor.toHexString(),
      evidencia: r.evidencia,
      versao: r.versao,
      conteudoNaDecisao: r.conteudoNaDecisao ?? null,
      historico: r.historico.map((e) => ({
        administradorId: e.administrador.toHexString(),
        ocorridoEm: e.ocorridoEm.toISOString(),
        anterior: e.anterior,
        estado: e.estado,
        motivo: e.motivo,
        versao: e.versao,
      })),
    };
  }
  async function reportView(r: ContentReport, session: ClientSession) {
    let content: Awaited<ReturnType<typeof target>> | null;
    try {
      content = await target(r.alvoTipo, r.alvoId.toHexString(), session);
    } catch (e) {
      if (!(e instanceof ApiError && e.status === 404)) throw e;
      content = null;
    }
    return {
      ...adminDto(r),
      conteudo: content,
      etag: moderationTag(key, `report-v1:${r._id}:${r.versao}:${content?.etag ?? 'indisponivel'}`),
    };
  }
  return {
    prepare,
    async create(user: AuthPrincipal, input: ReportInput) {
      const body = reportInput.parse(input);
      return transaction(async (session) => {
        const author = await moderationAccount(connection, user, undefined, session, true);
        if (
          await reports().findOne(
            { autor: author, alvoTipo: body.alvoTipo, alvoId: new Types.ObjectId(body.alvoId) },
            { session },
          )
        )
          throw new ApiError(
            409,
            'DENUNCIA_DUPLICADA',
            'Já denunciaste este conteúdo. Consulta o resultado antes de repetir.',
          );
        const content = await target(body.alvoTipo, body.alvoId, session, true);
        const r = new Report({
          autor: author,
          alvoTipo: body.alvoTipo,
          alvoId: new Types.ObjectId(body.alvoId),
          motivo: body.motivo,
          evidencia: content.evidencia,
        });
        await r.save({ session });
        return ownDto(r.toObject() as ContentReport);
      });
    },
    async own(user: AuthPrincipal, query: Pick<ReportInput, 'alvoId' | 'alvoTipo'>) {
      return transaction(async (session) => {
        const author = await moderationAccount(connection, user, undefined, session);
        const r = await reports().findOne(
          { autor: author, alvoTipo: query.alvoTipo, alvoId: new Types.ObjectId(query.alvoId) },
          { session, maxTimeMS: 5000 },
        );
        return { denuncia: r ? ownDto(r) : null };
      });
    },
    async list(user: AuthPrincipal, q: ReportQuery) {
      return transaction(async (session) => {
        await moderationAccount(connection, user, 'administrador', session);
        const filter = {
          ...(q.estado ? { estado: q.estado } : {}),
          ...(q.alvoTipo ? { alvoTipo: q.alvoTipo } : {}),
          ...(q.identificador ? { _id: new Types.ObjectId(q.identificador) } : {}),
        };
        const direction = q.ordem === 'antigas' ? 1 : -1;
        const [result] = await reports()
          .aggregate<{ itens: ContentReport[]; total: { n: number }[] }>(
            [
              { $match: filter },
              { $sort: { createdAt: direction, _id: direction } },
              {
                $facet: {
                  itens: [{ $skip: (q.pagina - 1) * q.porPagina }, { $limit: q.porPagina }],
                  total: [{ $count: 'n' }],
                },
              },
            ],
            { session, maxTimeMS: 5000 },
          )
          .toArray();
        const total = result?.total[0]?.n ?? 0;
        return {
          itens: (result?.itens ?? []).map(adminDto),
          pagina: q.pagina,
          porPagina: q.porPagina,
          total,
          totalPaginas: Math.ceil(total / q.porPagina),
        };
      });
    },
    async detail(user: AuthPrincipal, id: string) {
      return transaction(async (session) => {
        await moderationAccount(connection, user, 'administrador', session);
        return reportView(await report(id, session), session);
      });
    },
    async decide(
      user: AuthPrincipal,
      id: string,
      input: ReturnType<typeof reportDecision.parse>,
      match?: string,
    ) {
      const body = reportDecision.parse(input);
      return transaction(async (session) => {
        const admin = await moderationAccount(connection, user, 'administrador', session, true),
          r = await report(id, session),
          view = await reportView(r, session);
        requireModerationTag(view.etag, match);
        if (r.estado !== 'pendente')
          throw new ApiError(
            409,
            'ESTADO_CONFLITO',
            'A denúncia já foi decidida. Consulta o histórico.',
          );
        const now = new Date(),
          event = {
            administrador: admin,
            ocorridoEm: now,
            anterior: 'pendente' as const,
            estado: body.estado,
            motivo: body.motivo,
            versao: 1,
          };
        const context = view.conteudo
          ? {
              disponivel: true,
              estado: view.conteudo.estadoModeracao,
              versao: view.conteudo.versao,
            }
          : { disponivel: false };
        const updated = await reports().findOneAndUpdate(
          { _id: r._id, estado: 'pendente', versao: 0 },
          {
            $set: { estado: body.estado, updatedAt: now, conteudoNaDecisao: context },
            $inc: { versao: 1 },
            $push: { historico: event },
          },
          { session, returnDocument: 'after', includeResultMetadata: false },
        );
        if (!updated)
          throw new ApiError(409, 'CONFLITO_REVISAO', 'A denúncia mudou. Consulta novamente.');
        return reportView(updated, session);
      });
    },
    async contents(user: AuthPrincipal, q: ContentQuery) {
      return transaction(async (session) => {
        await moderationAccount(connection, user, 'administrador', session);
        const direction = q.ordem === 'antigas' ? 1 : -1;
        const [result] = await db
          .collection(q.tipo === 'produto' ? 'products' : 'producers')
          .aggregate<{ itens: { _id: Types.ObjectId }[]; total: { n: number }[] }>(
            [
              {
                $match: {
                  ...(q.identificador ? { _id: new Types.ObjectId(q.identificador) } : {}),
                  ...(q.estado === 'oculta'
                    ? { 'moderacao.estado': 'oculta' }
                    : q.estado === 'visivel'
                      ? { 'moderacao.estado': { $ne: 'oculta' } }
                      : {}),
                },
              },
              {
                $lookup: {
                  from: 'content_reports',
                  let: { target: '$_id' },
                  pipeline: [
                    {
                      $match: {
                        alvoTipo: q.tipo,
                        estado: 'pendente',
                        $expr: { $eq: ['$alvoId', '$$target'] },
                      },
                    },
                    { $limit: 1 },
                    { $project: { _id: 1 } },
                  ],
                  as: 'sinalizacoes',
                },
              },
              ...(q.sinalizados
                ? [{ $match: { 'sinalizacoes.0': { $exists: q.sinalizados === 'true' } } }]
                : []),
              { $sort: { createdAt: direction, _id: direction } },
              {
                $facet: {
                  itens: [
                    { $skip: (q.pagina - 1) * q.porPagina },
                    { $limit: q.porPagina },
                    { $project: { _id: 1 } },
                  ],
                  total: [{ $count: 'n' }],
                },
              },
            ],
            { session, maxTimeMS: 5000 },
          )
          .toArray();
        const itens = [];
        for (const r of result?.itens ?? [])
          itens.push(await target(q.tipo, r._id.toHexString(), session));
        const total = result?.total[0]?.n ?? 0;
        return {
          itens,
          pagina: q.pagina,
          porPagina: q.porPagina,
          total,
          totalPaginas: Math.ceil(total / q.porPagina),
        };
      });
    },
    async content(user: AuthPrincipal, kind: 'produto' | 'produtor', id: string) {
      return transaction(async (session) => {
        await moderationAccount(connection, user, 'administrador', session);
        return target(kind, id, session);
      });
    },
    async history(
      user: AuthPrincipal,
      kind: 'produto' | 'produtor',
      id: string,
      q: OrderListQuery,
    ) {
      return transaction(async (session) => {
        await moderationAccount(connection, user, 'administrador', session);
        const row = await db
          .collection<{ moderacao?: ContentVisibility }>(
            kind === 'produto' ? 'products' : 'producers',
          )
          .findOne(
            { _id: new Types.ObjectId(id) },
            { session, projection: { moderacao: 1 }, maxTimeMS: 5000 },
          );
        if (!row) throw missing();
        const history = row.moderacao?.historico ?? [],
          ordered = q.ordem === 'antigas' ? history : [...history].reverse();
        return {
          itens: ordered.slice((q.pagina - 1) * q.porPagina, q.pagina * q.porPagina).map((e) => ({
            ...e,
            administrador: undefined,
            administradorId: e.administrador.toHexString(),
            ocorridoEm: e.ocorridoEm.toISOString(),
          })),
          pagina: q.pagina,
          porPagina: q.porPagina,
          total: history.length,
          totalPaginas: Math.ceil(history.length / q.porPagina),
          versao: row.moderacao?.versao ?? 0,
        };
      });
    },
    async moderate(
      user: AuthPrincipal,
      kind: 'produto' | 'produtor',
      id: string,
      input: ReturnType<typeof contentDecision.parse>,
      match?: string,
    ) {
      const body = contentDecision.parse(input);
      return transaction(async (session) => {
        const admin = await moderationAccount(connection, user, 'administrador', session, true),
          view = await target(kind, id, session);
        requireModerationTag(view.etag, match);
        const collection = db.collection<ProductRecord | ProducerRecord>(
            kind === 'produto' ? 'products' : 'producers',
          ),
          row = await collection.findOne({ _id: new Types.ObjectId(id) }, { session });
        if (!row) throw missing();
        if (view.estadoModeracao === body.estado)
          throw new ApiError(409, 'ESTADO_CONFLITO', 'O conteúdo já tem esse estado.');
        if (view.versao >= 1000)
          throw new ApiError(
            409,
            'HISTORICO_DEMASIADO_GRANDE',
            'O histórico atingiu o limite e não foi eliminado.',
          );
        const now = new Date(),
          event = {
            administrador: admin,
            ocorridoEm: now,
            anterior: view.estadoModeracao,
            estado: body.estado,
            motivo: body.motivo,
            versao: view.versao + 1,
          };
        const updated = await collection.findOneAndUpdate(
          { _id: row._id, ...revisionCondition(operationalRevision(row.revisaoOperacional)) },
          {
            $set: {
              'moderacao.estado': body.estado,
              'moderacao.versao': view.versao + 1,
              updatedAt: now,
            },
            $push: { 'moderacao.historico': event },
            $inc: { revisaoOperacional: 1 },
          },
          { session, returnDocument: 'after', includeResultMetadata: false },
        );
        if (!updated)
          throw new ApiError(409, 'CONFLITO_REVISAO', 'O conteúdo mudou. Consulta novamente.');
        return target(kind, id, session);
      });
    },
  };
}
export type ModerationService = ReturnType<typeof createModerationService>;
