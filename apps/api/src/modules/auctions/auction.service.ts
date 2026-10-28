import { createHash } from 'node:crypto';
import { Types, mongo as mongoDriver } from 'mongoose';
import type { ClientSession, Connection, mongo } from 'mongoose';
import { ApiError } from '../../http/api-error.js';
import type { AuthPrincipal } from '../auth/auth.service.js';
import type { ProductRecord } from '../products/product.types.js';
import type { OrderSaleUnit } from '../orders/order.types.js';
import { decreaseProductStock } from '../products/product-stock.repository.js';
import { operationalRevision } from '../concurrency/concurrency-error.js';
import { createAuctionRepository } from './auction.repository.js';
import { releaseAuctionStock } from './auction-stock.repository.js';
import { auctionDto, auctionDetailDto, bidDto } from './auction.dto.js';
import { auctionSnapshot } from './auction.snapshot.js';
import { auctionCreate, auctionEditable, idempotencyKey, bidBody } from './auction.validation.js';
import type { AuctionCreate, AuctionEdit, AuctionQuery } from './auction.validation.js';
import type { AuctionRecord } from './auction.types.js';
import type { BidRecord } from './bid.types.js';
const unavailable = () =>
  new ApiError(404, 'LEILAO_NAO_ENCONTRADO', 'O leilão não está disponível.');
const conflict = () =>
  new ApiError(409, 'CONFLITO_IDEMPOTENCIA', 'Não é possível reutilizar a chave para este pedido.');
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
function role(user: AuthPrincipal, required: 'produtor' | 'comprador') {
  if (!user.papeis.includes(required))
    throw new ApiError(403, 'ACESSO_PROIBIDO', 'Não tens acesso a esta operação.');
  return new Types.ObjectId(user.id);
}
function key(value: unknown) {
  const p = idempotencyKey.safeParse(value);
  if (!p.success) throw new ApiError(400, 'CHAVE_INVALIDA', 'Envia uma Idempotency-Key válida.');
  return p.data;
}
function parse<T>(
  result:
    { success: true; data: T } | { success: false; error: { issues: { path: PropertyKey[] }[] } },
) {
  if (!result.success)
    throw new ApiError(
      400,
      'PEDIDO_INVALIDO',
      'Verifica os campos do pedido.',
      result.error.issues.map((issue) => ({
        campo: issue.path.map(String).join('.') || 'pedido',
        mensagem: 'Campo inválido.',
      })),
    );
  return result.data;
}
export function createAuctionService(connection: Connection, secret: Buffer | string) {
  const repo = createAuctionRepository(connection, secret);
  const listeners = new Set<(id: string) => void>();
  async function committed<T>(id: Types.ObjectId, work: (session: ClientSession) => Promise<T>) {
    const value = await repo.transaction(work);
    if (value !== false)
      for (const listener of listeners) {
        try {
          listener(id.toHexString());
        } catch {
          /* A leitura periódica recupera a publicação; nunca alterar o resultado confirmado. */
        }
      }
    return value;
  }
  async function owned(user: AuthPrincipal, id: string, session: ClientSession) {
    const owner = role(user, 'produtor');
    const a = await repo
      .auctions()
      .findOne({ _id: new Types.ObjectId(id), produtor: owner }, { session });
    if (!a) throw unavailable();
    return a;
  }
  async function result(a: AuctionRecord, user: string, session?: ClientSession) {
    const now = await repo.clock('auctions', a._id, session);
    return { body: auctionDetailDto(a, now, user, repo), etag: repo.tag(a) };
  }
  async function release(a: AuctionRecord, session: ClientSession) {
    const amounts = await releaseAuctionStock(connection, a, session);
    return {
      ...amounts,
      estado: amounts.pendente ? ('libertacao_pendente' as const) : ('libertada' as const),
    };
  }
  async function advance(id: Types.ObjectId) {
    return committed(id, async (session) => {
      const a = await repo.auctions().findOne({ _id: id }, { session });
      if (!a) return false;
      const now = await repo.clock('auctions', id, session);
      if (['agendado', 'ativo'].includes(a.estado) && a.terminaEm <= now) {
        const reserva = a.sequencia
          ? { ...a.reserva, estado: 'afeta_vencedor' as const }
          : await release(a, session);
        const winner = a.sequencia
          ? {
              tipo: 'vencedor' as const,
              comprador: a.licitacaoAtual.comprador,
              bidId: a.licitacaoAtual.bidId,
              valorCent: a.licitacaoAtual.valorCent,
            }
          : { tipo: 'sem_licitacoes' as const, comprador: null, bidId: null, valorCent: null };
        const changed = await repo.auctions().findOneAndUpdate(
          {
            _id: id,
            versao: a.versao,
            estado: { $in: ['agendado', 'ativo'] },
            $expr: { $lte: ['$terminaEm', '$$NOW'] },
          },
          {
            $set: { estado: 'terminado', resultado: winner, reserva, encerradoEm: now },
            $inc: { versao: 1 },
            $push: { historico: { tipo: 'terminado', origem: 'sistema', ocorridoEm: now } },
            $currentDate: { updatedAt: true },
          },
          { session, returnDocument: 'after', includeResultMetadata: false },
        );
        if (!changed)
          throw new ApiError(409, 'CONFLITO_REVISAO', 'O leilão mudou durante o encerramento.');
        return true;
      }
      if (a.estado === 'agendado' && a.iniciaEm <= now) {
        const changed = await repo.auctions().findOneAndUpdate(
          {
            _id: id,
            versao: a.versao,
            estado: 'agendado',
            $expr: { $and: [{ $lte: ['$iniciaEm', '$$NOW'] }, { $gt: ['$terminaEm', '$$NOW'] }] },
          },
          {
            $set: { estado: 'ativo' },
            $inc: { versao: 1 },
            $push: { historico: { tipo: 'ativado', origem: 'sistema', ocorridoEm: now } },
            $currentDate: { updatedAt: true },
          },
          { session, returnDocument: 'after', includeResultMetadata: false },
        );
        if (!changed)
          throw new ApiError(409, 'CONFLITO_REVISAO', 'O leilão mudou durante a ativação.');
        return true;
      }
      if (['terminado', 'cancelado'].includes(a.estado) && a.reserva.pendente) {
        const reserva = await release(a, session);
        if (reserva.reposta === a.reserva.reposta) return false;
        const changed = await repo.auctions().findOneAndUpdate(
          { _id: id, versao: a.versao, 'reserva.reposta': a.reserva.reposta },
          {
            $set: { reserva },
            $inc: { versao: 1 },
            $push: {
              historico: { tipo: 'stock_regularizado', origem: 'sistema', ocorridoEm: now },
            },
            $currentDate: { updatedAt: true },
          },
          { session, returnDocument: 'after', includeResultMetadata: false },
        );
        if (!changed)
          throw new ApiError(409, 'CONFLITO_REVISAO', 'O saldo mudou durante a regularização.');
        return true;
      }
      return false;
    });
  }
  async function recover() {
    let changed = 0;
    const filters: mongo.Filter<AuctionRecord>[] = [
      { estado: 'agendado', $expr: { $lte: ['$iniciaEm', '$$NOW'] } },
      { estado: 'ativo', $expr: { $lte: ['$terminaEm', '$$NOW'] } },
      { estado: { $in: ['terminado', 'cancelado'] }, 'reserva.pendente': { $gt: 0 } },
    ];
    const deadline = Date.now() + 5000;
    for (const [index, filter] of filters.entries()) {
      for (;;) {
        const rows = await repo
          .auctions()
          .find(
            index === 2 && pendingCursor ? { ...filter, _id: { $gt: pendingCursor } } : filter,
            { projection: { _id: 1 }, maxTimeMS: 5000 },
          )
          .sort({ _id: 1 })
          .limit(50)
          .toArray();
        for (const row of rows) if (await advance(row._id)) changed++;
        if (index === 2) {
          pendingCursor = rows.length === 50 ? rows.at(-1)!._id : undefined;
          break;
        }
        if (rows.length < 50 || Date.now() >= deadline) break;
      }
    }
    return changed;
  }
  let pendingCursor: Types.ObjectId | undefined;
  return {
    prepare: repo.prepare,
    subscribeCommitted(listener: (id: string) => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    async snapshot(id: string) {
      return repo.read(async () => {
        const _id = new Types.ObjectId(id);
        await advance(_id);
        const a = await repo
          .auctions()
          .findOne(
            { _id },
            { maxTimeMS: 5000, readConcern: { level: 'majority' }, readPreference: 'primary' },
          );
        if (!a) throw unavailable();
        return auctionSnapshot(a, await repo.clock('auctions', _id), repo);
      });
    },
    recover,
    advance,
    startLifecycle() {
      let active: Promise<unknown> | undefined;
      const timer = setInterval(() => {
        if (!active)
          active = recover()
            .catch(() => undefined)
            .finally(() => {
              active = undefined;
            });
      }, 1000);
      timer.unref();
      return async () => {
        clearInterval(timer);
        await active;
      };
    },
    async create(user: AuthPrincipal, body: unknown, header: unknown) {
      const owner = role(user, 'produtor'),
        input: AuctionCreate = parse(auctionCreate.safeParse(body)),
        request = key(header),
        hash = digest(input),
        id = new Types.ObjectId();
      return committed(id, async (session) => {
        const previous = await repo
          .auctions()
          .findOne({ produtor: owner, 'criacao.chave': request }, { session });
        if (previous) {
          if (previous.criacao.hash !== hash) throw conflict();
          return { ...(await result(previous, user.id, session)), status: 200 };
        }
        await repo.guardUsers([{ id: owner, roles: ['produtor'] }], session);
        const profile = await repo.guardProfile(owner, session);
        const product = await connection
          .db!.collection<ProductRecord>('products')
          .findOne({ _id: new Types.ObjectId(input.produtoId), produtor: owner }, { session });
        if (!product)
          throw new ApiError(
            404,
            'PRODUTO_INDISPONIVEL',
            'O produto não está disponível para a tua produção.',
          );
        const now = await repo.clock('users', owner, session),
          start = input.iniciaEm ?? now;
        if (
          input.terminaEm <= now ||
          input.terminaEm <= start ||
          (input.iniciaEm && input.iniciaEm < now)
        )
          throw new ApiError(
            400,
            'DATAS_INVALIDAS',
            'Escolhe um início futuro ou imediato e um fim posterior.',
          );
        await decreaseProductStock(
          connection,
          {
            produtoId: product._id,
            produtorId: owner,
            revisaoEsperada: operationalRevision(product.revisaoOperacional),
            quantidade: input.quantidade,
            precoAceiteCent: product.precoCent!,
            unidadeAceite: product.unidadeVenda as OrderSaleUnit,
          },
          session,
        );
        const latest = await repo.clock('users', owner, session);
        if (input.terminaEm <= latest)
          throw new ApiError(409, 'LEILAO_FORA_PRAZO', 'O prazo terminou antes da criação.');
        const doc = new repo.Auction({
          _id: id,
          produtor: owner,
          produto: product._id,
          produtorPublico: { perfilId: profile._id, nome: profile.nomePublico },
          titulo: input.titulo,
          descricao: input.descricao,
          lote: {
            nome: product.nome,
            quantidade: input.quantidade,
            unidadeVenda: product.unidadeVenda,
          },
          precoBaseCent: input.precoBaseCent,
          incrementoCent: input.incrementoCent,
          iniciaEm: start,
          terminaEm: input.terminaEm,
          estado: start > latest ? 'agendado' : 'ativo',
          licitacaoAtual: { valorCent: input.precoBaseCent, comprador: null, bidId: null },
          sequencia: 0,
          versao: 0,
          reserva: { estado: 'reservada', reposta: 0, pendente: 0 },
          criacao: { chave: request, hash },
          historico: [{ tipo: 'criado', origem: 'produtor', ator: owner, ocorridoEm: now }],
          createdAt: now,
          updatedAt: now,
        });
        await doc.save({ session });
        return {
          ...(await result(doc.toObject({ transform: false }) as AuctionRecord, user.id, session)),
          status: 201,
        };
      });
    },
    async list(query: AuctionQuery, user?: AuthPrincipal) {
      if (user) role(user, 'produtor');
      return repo.read(async () => {
        await recover();
        const filter = {
          ...(user ? { produtor: new Types.ObjectId(user.id) } : {}),
          ...(query.estado ? { estado: query.estado } : {}),
        };
        const direction = query.ordem === 'antigas' ? 1 : -1;
        const [rows] = await repo
          .auctions()
          .aggregate<{ itens: AuctionRecord[]; contagem: { total: number }[] }>(
            [
              { $match: filter },
              { $set: { observadoEm: '$$NOW' } },
              { $sort: { createdAt: direction, _id: direction } },
              {
                $facet: {
                  itens: [
                    { $skip: (query.pagina - 1) * query.porPagina },
                    { $limit: query.porPagina },
                  ],
                  contagem: [{ $count: 'total' }],
                },
              },
            ],
            { maxTimeMS: 5000, readConcern: { level: 'majority' }, readPreference: 'primary' },
          )
          .toArray();
        const total = rows?.contagem[0]?.total ?? 0;
        const itens = [];
        for (const a of rows?.itens ?? []) {
          // Não anunciar um estado materializado que já deixou de corresponder ao prazo.
          const observed = (a as AuctionRecord & { observadoEm: Date }).observadoEm;
          if (
            (a.estado === 'agendado' && a.iniciaEm <= observed) ||
            (a.estado === 'ativo' && a.terminaEm <= observed)
          )
            throw new ApiError(
              503,
              'ESTADO_EM_ATUALIZACAO',
              'O estado está a ser atualizado. Repete a consulta.',
            );
          itens.push(user ? auctionDetailDto(a, observed, user.id, repo) : auctionDto(a, observed));
        }
        return {
          itens,
          pagina: query.pagina,
          porPagina: query.porPagina,
          total,
          totalPaginas: Math.ceil(total / query.porPagina),
        };
      });
    },
    async detail(user: AuthPrincipal, id: string) {
      return repo.read(async () => {
        await advance(new Types.ObjectId(id));
        const a = await repo
          .auctions()
          .findOne(
            { _id: new Types.ObjectId(id) },
            { maxTimeMS: 5000, readConcern: { level: 'majority' }, readPreference: 'primary' },
          );
        if (!a) throw unavailable();
        return result(a, user.id);
      });
    },
    async edit(user: AuthPrincipal, id: string, body: unknown, etag?: string) {
      const input: AuctionEdit = parse(auctionEditable.safeParse(body));
      return committed(new Types.ObjectId(id), async (session) => {
        const a = await owned(user, id, session);
        repo.match(a, etag);
        await repo.guardUsers([{ id: a.produtor, roles: ['produtor'] }], session);
        await repo.guardProfile(a.produtor, session);
        const now = await repo.clock('auctions', a._id, session),
          start = input.iniciaEm ?? now;
        if (input.terminaEm <= now || start < now || input.terminaEm <= start)
          throw new ApiError(400, 'DATAS_INVALIDAS', 'Verifica o período futuro do leilão.');
        if (a.estado !== 'agendado' || a.sequencia)
          throw new ApiError(
            409,
            'EDICAO_INDISPONIVEL',
            'Só podes editar antes do início e sem ofertas.',
          );
        // Reservar margem para o encerramento, sem truncar a auditoria existente.
        if (mongoDriver.BSON.calculateObjectSize(a) + 80000 > 16 * 1024 * 1024)
          throw new ApiError(409, 'CAPACIDADE_AUDITORIA', 'O histórico já não permite edição.');
        const changed = await repo.auctions().findOneAndUpdate(
          {
            _id: a._id,
            produtor: a.produtor,
            versao: a.versao,
            estado: 'agendado',
            sequencia: 0,
            $expr: {
              $and: [{ $lt: ['$$NOW', '$iniciaEm'] }, { $gt: [input.terminaEm, '$$NOW'] }],
            },
          },
          {
            $set: {
              titulo: input.titulo,
              descricao: input.descricao,
              precoBaseCent: input.precoBaseCent,
              incrementoCent: input.incrementoCent,
              iniciaEm: start,
              terminaEm: input.terminaEm,
              licitacaoAtual: { valorCent: input.precoBaseCent, comprador: null, bidId: null },
              estado: start > now ? 'agendado' : 'ativo',
            },
            $inc: { versao: 1 },
            $push: {
              historico: {
                tipo: 'editado',
                origem: 'produtor',
                ator: a.produtor,
                ocorridoEm: now,
              },
            },
            $currentDate: { updatedAt: true },
          },
          { session, returnDocument: 'after', includeResultMetadata: false },
        );
        if (!changed)
          throw new ApiError(409, 'EDICAO_INDISPONIVEL', 'O leilão já começou ou mudou.');
        return result(changed, user.id, session);
      });
    },
    async cancel(user: AuthPrincipal, id: string, etag?: string) {
      return committed(new Types.ObjectId(id), async (session) => {
        const a = await owned(user, id, session);
        repo.match(a, etag);
        if (!['agendado', 'ativo'].includes(a.estado) || a.sequencia)
          throw new ApiError(
            409,
            'CANCELAMENTO_INDISPONIVEL',
            'Não podes cancelar depois de uma oferta ou do encerramento.',
          );
        await repo.guardUsers([{ id: a.produtor, roles: ['produtor'] }], session);
        const now = await repo.clock('auctions', a._id, session),
          reserva = await release(a, session);
        const changed = await repo.auctions().findOneAndUpdate(
          {
            _id: a._id,
            produtor: a.produtor,
            versao: a.versao,
            estado: { $in: ['agendado', 'ativo'] },
            sequencia: 0,
            $expr: { $gt: ['$terminaEm', '$$NOW'] },
          },
          {
            $set: { estado: 'cancelado', reserva, encerradoEm: now },
            $inc: { versao: 1 },
            $push: {
              historico: {
                tipo: 'cancelado',
                origem: 'produtor',
                ator: a.produtor,
                ocorridoEm: now,
              },
            },
            $currentDate: { updatedAt: true },
          },
          { session, returnDocument: 'after', includeResultMetadata: false },
        );
        if (!changed)
          throw new ApiError(409, 'CANCELAMENTO_INDISPONIVEL', 'O leilão já terminou ou mudou.');
        return result(changed, user.id, session);
      });
    },
    async bid(user: AuthPrincipal, id: string, body: unknown, header: unknown) {
      const buyer = role(user, 'comprador'),
        input = parse(bidBody.safeParse(body)),
        request = key(header),
        hash = digest(input),
        auctionId = new Types.ObjectId(id),
        bidId = new Types.ObjectId();
      return committed(auctionId, async (session) => {
        const a = await repo.auctions().findOne({ _id: auctionId }, { session });
        if (!a) throw unavailable();
        const previous = await repo
          .bids()
          .findOne({ leilao: auctionId, comprador: buyer, requestId: request }, { session });
        if (previous) {
          if (previous.requestHash !== hash) throw conflict();
          await repo.guardUsers([{ id: buyer, roles: ['comprador'] }], session);
          return {
            status: 200,
            snapshot: auctionSnapshot(a, await repo.clock('auctions', a._id, session), repo),
            body: {
              origem: 'replay' as const,
              licitacao: bidDto(previous, a, user.id, repo),
              leilao: auctionDetailDto(
                a,
                await repo.clock('auctions', a._id, session),
                user.id,
                repo,
              ),
            },
          };
        }
        if (a.produtor.equals(buyer))
          throw new ApiError(
            403,
            'AUTO_LICITACAO_PROIBIDA',
            'Não podes licitar no teu próprio leilão.',
          );
        if (!['agendado', 'ativo'].includes(a.estado))
          throw new ApiError(409, 'LEILAO_ENCERRADO', 'O leilão não aceita licitações.');
        if (BigInt(input.valorCent) < BigInt(a.licitacaoAtual.valorCent) + BigInt(a.incrementoCent))
          throw new ApiError(
            409,
            'LICITACAO_INSUFICIENTE',
            'O valor não satisfaz o incremento mínimo atual.',
          );
        await repo.guardUsers(
          [
            { id: buyer, roles: ['comprador'] },
            { id: a.produtor, roles: ['produtor'] },
          ],
          session,
        );
        await repo.guardProfile(a.produtor, session);
        const changed = await repo.auctions().findOneAndUpdate(
          {
            _id: a._id,
            versao: a.versao,
            sequencia: a.sequencia,
            estado: { $in: ['agendado', 'ativo'] },
            $expr: {
              $and: [
                { $lte: ['$iniciaEm', '$$NOW'] },
                { $gt: ['$terminaEm', '$$NOW'] },
                {
                  $gte: [
                    input.valorCent,
                    { $add: ['$licitacaoAtual.valorCent', '$incrementoCent'] },
                  ],
                },
              ],
            },
          },
          [
            {
              $set: {
                estado: 'ativo',
                licitacaoAtual: {
                  $literal: { valorCent: input.valorCent, comprador: buyer, bidId },
                },
                sequencia: { $add: ['$sequencia', 1] },
                versao: { $add: ['$versao', 1] },
                updatedAt: '$$NOW',
                historico: {
                  $cond: [
                    { $eq: ['$estado', 'agendado'] },
                    {
                      $concatArrays: [
                        '$historico',
                        [{ tipo: 'ativado', origem: 'sistema', ocorridoEm: '$$NOW' }],
                      ],
                    },
                    '$historico',
                  ],
                },
              },
            },
          ],
          { session, returnDocument: 'after', includeResultMetadata: false },
        );
        if (!changed)
          throw new ApiError(
            409,
            'LEILAO_FORA_PRAZO',
            'O leilão não está ativo no instante da operação.',
          );
        const b: BidRecord = {
          _id: bidId,
          leilao: auctionId,
          comprador: buyer,
          valorCent: input.valorCent,
          sequencia: changed.sequencia,
          requestId: request,
          requestHash: hash,
          aceiteEm: changed.updatedAt,
        };
        await new repo.Bid(b).save({ session });
        return {
          status: 201,
          snapshot: auctionSnapshot(changed, changed.updatedAt, repo),
          body: {
            origem: 'nova' as const,
            licitacao: bidDto(b, changed, user.id, repo),
            leilao: auctionDetailDto(changed, changed.updatedAt, user.id, repo),
          },
        };
      });
    },
    async history(user: AuthPrincipal, id: string, query: AuctionQuery) {
      await advance(new Types.ObjectId(id));
      return repo.transaction(async (session) => {
        const a = await repo.auctions().findOne({ _id: new Types.ObjectId(id) }, { session });
        if (!a) throw unavailable();
        const direction = query.ordem === 'antigas' ? 1 : -1;
        const rows = await repo
          .bids()
          .find({ leilao: a._id, sequencia: { $lte: a.sequencia } }, { session })
          .sort({ sequencia: direction })
          .skip((query.pagina - 1) * query.porPagina)
          .limit(query.porPagina)
          .toArray();
        return {
          itens: rows.map((b) => bidDto(b, a, user.id, repo)),
          pagina: query.pagina,
          porPagina: query.porPagina,
          total: a.sequencia,
          totalPaginas: Math.ceil(a.sequencia / query.porPagina),
          sequenciaSnapshot: a.sequencia,
          versaoSnapshot: a.versao,
          serverNow: (await repo.clock('auctions', a._id, session)).toISOString(),
        };
      });
    },
  };
}
export type AuctionService = ReturnType<typeof createAuctionService>;
