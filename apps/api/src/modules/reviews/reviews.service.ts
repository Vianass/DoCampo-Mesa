import { createHmac } from 'node:crypto';
import {
  Types,
  mongo,
  Error as MongooseError,
  type Connection,
  type ClientSession,
} from 'mongoose';
import { ApiError } from '../../http/api-error.js';
import { unauthorized, type AuthPrincipal } from '../auth/auth.service.js';
import { createCatalogService } from '../catalog/catalog.service.js';
import { operationalRevision, revisionCondition } from '../concurrency/concurrency-error.js';
import { isCheckoutReadUnavailable } from '../orders/checkout.idempotency.js';
import type { OrderRecord } from '../orders/order.types.js';
import type { OrderListQuery } from '../orders/orders.validation.js';
import type { UserRecord } from '../users/user.model.js';
import { createReviewModel } from './review.model.js';
import type { ReviewRecord } from './review.types.js';
import {
  reviewCreateInput,
  reviewDecisionInput,
  type ReviewCreateInput,
  type ReviewAdminQuery,
  type ReviewDecisionInput,
} from './review.validation.js';
export function reviewEligible(order: Pick<OrderRecord, 'estado' | 'rececao'>) {
  return order.estado === 'concluida' && order.rececao?.concluidaEm instanceof Date;
}
const missing = () =>
  new ApiError(404, 'AVALIACAO_NAO_ENCONTRADA', 'A avaliação não está disponível.');
const forbidden = () => new ApiError(403, 'ACESSO_PROIBIDO', 'Não tens acesso a esta operação.');
export function createReviewsService(connection: Connection, key: Uint8Array) {
  const Review = createReviewModel(connection),
    catalog = createCatalogService(connection, key),
    rows = () => connection.db!.collection<ReviewRecord>('reviews');
  let ready: Promise<void> | undefined;
  const prepare = () =>
    (ready ??= (async () => {
      await Review.createCollection();
      await Review.createIndexes();
    })());
  function fail(error: unknown): never {
    if (error instanceof ApiError) throw error;
    if (error instanceof mongo.MongoServerError && error.code === 11000)
      throw new ApiError(
        409,
        'AVALIACAO_DUPLICADA',
        'Já existe uma avaliação para esta encomenda e alvo. Consulta as tuas avaliações.',
      );
    if (error instanceof MongooseError.ValidationError || error instanceof MongooseError.CastError)
      throw new ApiError(400, 'AVALIACAO_INVALIDA', 'Revê os campos da avaliação.');
    if (isCheckoutReadUnavailable(error))
      throw new ApiError(
        503,
        'RESULTADO_INDETERMINADO',
        'Não foi possível confirmar o resultado. Consulta o estado antes de repetir.',
      );
    throw error;
  }
  async function transaction<T>(fn: (s: ClientSession) => Promise<T>) {
    await prepare();
    const s = await connection.startSession();
    let attempts = 0;
    try {
      return await s.withTransaction(
        async () => {
          if (++attempts > 5)
            throw new ApiError(
              409,
              'CONFLITO_REVISAO',
              'Os dados mudaram. Consulta antes de repetir.',
            );
          return fn(s);
        },
        {
          readConcern: { level: 'snapshot' },
          writeConcern: { w: 'majority' },
          readPreference: 'primary',
          timeoutMS: 10000,
        },
      );
    } catch (e) {
      return fail(e);
    } finally {
      await s.endSession();
    }
  }
  async function account(
    p: AuthPrincipal,
    role: 'comprador' | 'administrador',
    s?: ClientSession,
    fence = false,
  ) {
    const users = connection.db!.collection<UserRecord>('users'),
      id = new Types.ObjectId(p.id);
    const u = await users.findOne(
      { _id: id },
      {
        session: s,
        projection: { _id: 1, papeis: 1, ativo: 1, revisaoOperacional: 1 },
        maxTimeMS: 5000,
      },
    );
    if (!u || u.ativo === false) throw unauthorized();
    if (!u.papeis.includes(role)) throw forbidden();
    if (fence) {
      const result = await users.updateOne(
        {
          _id: id,
          ativo: { $ne: false },
          papeis: role,
          ...revisionCondition(operationalRevision(u.revisaoOperacional)),
        },
        { $inc: { revisaoOperacional: 1 } },
        { session: s },
      );
      if (result.matchedCount !== 1)
        throw new ApiError(409, 'CONFLITO_REVISAO', 'O acesso mudou. Consulta novamente.');
    }
    return id;
  }
  function publicDto(r: ReviewRecord) {
    return {
      id: r._id.toHexString(),
      alvoTipo: r.alvoTipo,
      alvoNome: r.alvoNome,
      ...(r.produto ? { produtoId: r.produto.toHexString() } : {}),
      produtorPerfilId: r.perfilProdutor.toHexString(),
      classificacao: r.classificacao,
      comentario: r.comentario,
      criadaEm: r.createdAt.toISOString(),
      autorPublico:
        'Comprador verificado · ' +
        createHmac('sha256', key)
          .update(`review-author-v1:${r._id}:${r.autor}`)
          .digest('base64url')
          .slice(0, 12),
      compraVerificada: true as const,
    };
  }
  function ownDto(r: ReviewRecord) {
    return {
      ...publicDto(r),
      encomendaId: r.encomenda.toHexString(),
      estado: r.estado,
      versao: r.versao,
      atualizadaEm: r.updatedAt.toISOString(),
    };
  }
  function adminDto(r: ReviewRecord) {
    return { ...ownDto(r), produtorContaId: r.vendedor.toHexString() };
  }
  function tag(r: ReviewRecord) {
    return (
      '"' +
      createHmac('sha256', key)
        .update(`review-v1:${r._id}:${r.versao}:${r.estado}`)
        .digest('base64url') +
      '"'
    );
  }
  async function find(id: string, s?: ClientSession) {
    const r = await rows().findOne(
      { _id: new Types.ObjectId(id) },
      { session: s, maxTimeMS: 5000 },
    );
    if (!r) throw missing();
    return r;
  }
  async function page(
    filter: Record<string, unknown>,
    q: OrderListQuery,
    mode: 'public' | 'own' | 'admin',
    session?: ClientSession,
  ) {
    const d = q.ordem === 'antigas' ? 1 : -1;
    const [result] = await rows()
      .aggregate<{
        itens: ReviewRecord[];
        total: { n: number }[];
        estrelas: { _id: number; n: number }[];
      }>(
        [
          { $match: filter },
          { $sort: { createdAt: d, _id: d } },
          {
            $facet: {
              itens: [
                { $skip: (q.pagina - 1) * q.porPagina },
                { $limit: q.porPagina },
                { $project: { historico: 0 } },
              ],
              total: [{ $count: 'n' }],
              estrelas: [{ $group: { _id: '$classificacao', n: { $sum: 1 } } }],
            },
          },
        ],
        {
          session,
          maxTimeMS: 5000,
          ...(!session
            ? { readConcern: { level: 'majority' as const }, readPreference: 'primary' as const }
            : {}),
        },
      )
      .toArray();
    const total = result?.total[0]?.n ?? 0,
      distribution = Object.fromEntries(
        [1, 2, 3, 4, 5].map((k) => [String(k), result?.estrelas.find((e) => e._id === k)?.n ?? 0]),
      );
    const sum = Object.entries(distribution).reduce((a, [k, n]) => a + BigInt(k) * BigInt(n), 0n);
    return {
      itens: (result?.itens ?? []).map(
        mode === 'public' ? publicDto : mode === 'own' ? ownDto : adminDto,
      ),
      pagina: q.pagina,
      porPagina: q.porPagina,
      total,
      totalPaginas: Math.ceil(total / q.porPagina),
      resumo: {
        numeroAvaliacoes: total,
        media: total ? Number(sum) / total : null,
        distribuicao: distribution,
      },
    };
  }
  return {
    prepare,
    async create(p: AuthPrincipal, input: ReviewCreateInput) {
      const parsed = reviewCreateInput.safeParse(input);
      if (!parsed.success)
        throw new ApiError(400, 'AVALIACAO_INVALIDA', 'Revê os campos da avaliação.');
      const body = parsed.data;
      return transaction(async (s) => {
        const buyer = await account(p, 'comprador', s, true),
          order = await connection
            .db!.collection<OrderRecord>('orders')
            .findOne(
              { _id: new Types.ObjectId(body.encomendaId), comprador: buyer },
              { session: s, maxTimeMS: 5000 },
            );
        if (!order)
          throw new ApiError(404, 'ENCOMENDA_NAO_ENCONTRADA', 'A encomenda não está disponível.');
        if (!reviewEligible(order))
          throw new ApiError(
            409,
            'COMPRA_NAO_ELEGIVEL',
            'A avaliação exige uma encomenda concluída.',
          );
        const line =
          body.alvoTipo === 'produto'
            ? order.linhas.find((l) => l.produto.toHexString() === body.produtoId)
            : undefined;
        if (body.alvoTipo === 'produto' && !line)
          throw new ApiError(
            400,
            'PRODUTO_NAO_COMPRADO',
            'O produto não pertence a esta encomenda.',
          );
        const profile = await connection
          .db!.collection('producers')
          .findOne(
            { userId: order.produtor },
            { session: s, projection: { _id: 1, nomePublico: 1 }, maxTimeMS: 5000 },
          );
        if (!profile)
          throw new ApiError(
            409,
            'ALVO_INDISPONIVEL',
            'O perfil associado à compra não está disponível.',
          );
        const [record] = await Review.create(
          [
            {
              autor: buyer,
              encomenda: order._id,
              alvoTipo: body.alvoTipo,
              ...(line ? { produto: line.produto } : { produtor: order.produtor }),
              vendedor: order.produtor,
              perfilProdutor: profile._id,
              alvoNome: line?.nome ?? profile.nomePublico,
              classificacao: body.classificacao,
              comentario: body.comentario,
              estado: 'publicada',
              versao: 0,
              historico: [],
            },
          ],
          { session: s },
        );
        return ownDto(record!.toObject({ transform: false }));
      });
    },
    async own(p: AuthPrincipal, q: OrderListQuery) {
      try {
        const id = await account(p, 'comprador');
        return await page({ autor: id }, q, 'own');
      } catch (e) {
        return fail(e);
      }
    },
    async ownDetail(p: AuthPrincipal, id: string) {
      try {
        const buyer = await account(p, 'comprador'),
          r = await find(id);
        if (!r.autor.equals(buyer)) throw missing();
        return ownDto(r);
      } catch (e) {
        return fail(e);
      }
    },
    async eligibility(p: AuthPrincipal, q: OrderListQuery) {
      try {
        const buyer = await account(p, 'comprador'),
          d = q.ordem === 'antigas' ? 1 : -1;
        const [data] = await connection
          .db!.collection<OrderRecord>('orders')
          .aggregate<{ itens: OrderRecord[]; total: { n: number }[] }>(
            [
              { $match: { comprador: buyer } },
              { $sort: { createdAt: d, _id: d } },
              {
                $facet: {
                  itens: [
                    { $skip: (q.pagina - 1) * q.porPagina },
                    { $limit: q.porPagina },
                    { $project: { _id: 1, produtor: 1, estado: 1, rececao: 1, linhas: 1 } },
                  ],
                  total: [{ $count: 'n' }],
                },
              },
            ],
            { maxTimeMS: 5000, readConcern: { level: 'majority' }, readPreference: 'primary' },
          )
          .toArray();
        const total = data?.total[0]?.n ?? 0,
          orders = data?.itens ?? [],
          reviews = await rows()
            .find(
              { autor: buyer, encomenda: { $in: orders.map((o) => o._id) } },
              { projection: { _id: 1, encomenda: 1, produto: 1, alvoTipo: 1 }, maxTimeMS: 5000 },
            )
            .toArray();
        return {
          pagina: q.pagina,
          porPagina: q.porPagina,
          total,
          totalPaginas: Math.ceil(total / q.porPagina),
          itens: orders.map((o) => ({
            encomendaId: o._id.toHexString(),
            estadoEncomenda: o.estado,
            elegivel: reviewEligible(o),
            alvos: [
              ...o.linhas.map((l) => ({
                alvoTipo: 'produto' as const,
                produtoId: l.produto.toHexString(),
                nome: l.nome,
              })),
              { alvoTipo: 'produtor' as const, nome: 'Produtor desta encomenda' },
            ].map((target) => ({
              ...target,
              avaliacaoId:
                reviews
                  .find(
                    (r) =>
                      r.encomenda.equals(o._id) &&
                      r.alvoTipo === target.alvoTipo &&
                      (target.alvoTipo === 'produtor' ||
                        r.produto?.toHexString() === target.produtoId),
                  )
                  ?._id.toHexString() ?? null,
            })),
          })),
        };
      } catch (e) {
        return fail(e);
      }
    },
    async publicProduct(id: string, q: OrderListQuery) {
      try {
        await catalog.product(id);
        return await page(
          { produto: new Types.ObjectId(id), alvoTipo: 'produto', estado: 'publicada' },
          q,
          'public',
        );
      } catch (e) {
        return fail(e);
      }
    },
    async publicProducer(id: string, q: OrderListQuery, kind: 'produto' | 'produtor') {
      try {
        await catalog.producer(id);
        return await page(
          { perfilProdutor: new Types.ObjectId(id), alvoTipo: kind, estado: 'publicada' },
          q,
          'public',
        );
      } catch (e) {
        return fail(e);
      }
    },
    async adminList(p: AuthPrincipal, q: ReviewAdminQuery) {
      try {
        await account(p, 'administrador');
        const f: Record<string, unknown> = {};
        if (q.estado) f.estado = q.estado;
        if (q.classificacao) f.classificacao = q.classificacao;
        if (q.alvoTipo) f.alvoTipo = q.alvoTipo;
        for (const [k, col] of [
          ['produto', 'produto'],
          ['produtor', 'perfilProdutor'],
          ['identificador', '_id'],
        ] as const)
          if (q[k]) f[col] = new Types.ObjectId(q[k]);
        return await page(f, q, 'admin');
      } catch (e) {
        return fail(e);
      }
    },
    async adminDetail(p: AuthPrincipal, id: string) {
      try {
        await account(p, 'administrador');
        const r = await find(id);
        return { body: adminDto(r), etag: tag(r) };
      } catch (e) {
        return fail(e);
      }
    },
    async history(p: AuthPrincipal, id: string, q: OrderListQuery) {
      return transaction(async (s) => {
        await account(p, 'administrador', s);
        const r = await find(id, s),
          events = q.ordem === 'antigas' ? r.historico : [...r.historico].reverse();
        return {
          itens: events.slice((q.pagina - 1) * q.porPagina, q.pagina * q.porPagina).map((e) => ({
            administradorId: e.administrador.toHexString(),
            ocorridoEm: e.ocorridoEm.toISOString(),
            anterior: e.anterior,
            estado: e.estado,
            motivo: e.motivo,
            versao: e.versao,
          })),
          total: events.length,
          totalPaginas: Math.ceil(events.length / q.porPagina),
          pagina: q.pagina,
          porPagina: q.porPagina,
          versaoSnapshot: r.versao,
        };
      });
    },
    async moderate(p: AuthPrincipal, id: string, input: ReviewDecisionInput, match?: string) {
      const parsed = reviewDecisionInput.safeParse(input);
      if (!parsed.success)
        throw new ApiError(400, 'DECISAO_INVALIDA', 'Indica um estado e um motivo válido.');
      return transaction(async (s) => {
        const admin = await account(p, 'administrador', s, true),
          r = await find(id, s);
        if (!match)
          throw new ApiError(428, 'PRECONDICAO_OBRIGATORIA', 'Envia o ETag atual em If-Match.');
        if (!/^"[A-Za-z0-9_-]{43}"$/.test(match))
          throw new ApiError(400, 'IF_MATCH_INVALIDO', 'Envia um único ETag forte.');
        if (match !== tag(r))
          throw new ApiError(
            412,
            'PRECONDICAO_FALHOU',
            'A avaliação mudou. Consulta-a antes de decidir.',
          );
        if (r.estado === parsed.data.estado)
          throw new ApiError(409, 'ESTADO_CONFLITO', 'A avaliação já tem esse estado.');
        if (r.historico.length >= 1000)
          throw new ApiError(
            409,
            'HISTORICO_DEMASIADO_GRANDE',
            'O histórico atingiu o limite de decisões; não foi eliminado.',
          );
        const now = new Date(),
          event = {
            administrador: admin,
            ocorridoEm: now,
            anterior: r.estado,
            estado: parsed.data.estado,
            motivo: parsed.data.motivo,
            versao: r.versao + 1,
          };
        const updated = await rows().findOneAndUpdate(
          { _id: r._id, versao: r.versao, estado: r.estado },
          {
            $set: { estado: parsed.data.estado, updatedAt: now },
            $inc: { versao: 1 },
            $push: { historico: event },
          },
          { session: s, returnDocument: 'after', includeResultMetadata: false },
        );
        if (!updated)
          throw new ApiError(
            409,
            'CONFLITO_REVISAO',
            'A avaliação mudou. Consulta-a antes de decidir.',
          );
        return { body: adminDto(updated), etag: tag(updated) };
      });
    },
  };
}
export type ReviewsService = ReturnType<typeof createReviewsService>;
