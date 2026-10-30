import { Types, type Connection } from 'mongoose';
import { ApiError } from '../../http/api-error.js';
import { unauthorized, type AuthPrincipal } from '../auth/auth.service.js';
import { createAuctionRepository } from '../auctions/auction.repository.js';
import { auctionDto } from '../auctions/auction.dto.js';
import { auctionStates, type AuctionRecord, type AuctionState } from '../auctions/auction.types.js';
import type { OrderListQuery } from '../orders/orders.validation.js';
import type { AdminAuctionQuery } from './admin-auctions.validation.js';
const projection = {
  _id: 1,
  produtor: 1,
  produto: 1,
  produtorPublico: 1,
  titulo: 1,
  descricao: 1,
  lote: 1,
  precoBaseCent: 1,
  incrementoCent: 1,
  iniciaEm: 1,
  terminaEm: 1,
  estado: 1,
  licitacaoAtual: 1,
  sequencia: 1,
  versao: 1,
  resultado: 1,
  encerradoEm: 1,
  createdAt: 1,
  updatedAt: 1,
  observadoEm: 1,
};
type Observed = AuctionRecord & { observadoEm: Date };
export function adminAuctionFilter(q: AdminAuctionQuery) {
  const f: Record<string, unknown> = {};
  if (q.estado) f.estado = q.estado;
  for (const k of ['produtor', 'produto'] as const) if (q[k]) f[k] = new Types.ObjectId(q[k]);
  if (q.identificador) f._id = new Types.ObjectId(q.identificador);
  if (q.desde || q.ate)
    f.iniciaEm = {
      ...(q.desde ? { $gte: new Date(q.desde + 'T00:00:00Z') } : {}),
      ...(q.ate ? { $lt: new Date(Date.parse(q.ate + 'T00:00:00Z') + 86400000) } : {}),
    };
  return f;
}
export function createAdminAuctionsService(connection: Connection, key: Buffer | string) {
  const repo = createAuctionRepository(connection, key),
    options = {
      maxTimeMS: 5000,
      readConcern: { level: 'majority' as const },
      readPreference: 'primary' as const,
    };
  const missing = () => new ApiError(404, 'LEILAO_NAO_ENCONTRADO', 'O leilão não está disponível.');
  async function admin(principal: AuthPrincipal) {
    const a = await connection
      .db!.collection('users')
      .findOne(
        { _id: new Types.ObjectId(principal.id) },
        { projection: { ativo: 1, papeis: 1 }, maxTimeMS: 5000 },
      );
    if (!a || a.ativo === false) throw unauthorized();
    if (!a.papeis?.includes('administrador'))
      throw new ApiError(403, 'ACESSO_PROIBIDO', 'Não tens acesso a esta operação.');
  }
  function dto(a: Observed) {
    const now = a.observadoEm;
    return {
      ...auctionDto(a, now),
      produtorContaId: a.produtor.toHexString(),
      numeroLicitacoes: a.sequencia,
      estadoEmAtualizacao:
        (a.estado === 'agendado' && a.iniciaEm <= now) ||
        (a.estado === 'ativo' && a.terminaEm <= now),
      lider: a.licitacaoAtual.comprador
        ? { referencia: repo.participant(a, a.licitacaoAtual.comprador) }
        : null,
      ...(a.estado === 'terminado' && a.resultado?.tipo === 'vencedor' && a.resultado.comprador
        ? { vencedor: { referencia: repo.participant(a, a.resultado.comprador) } }
        : {}),
    };
  }
  return {
    async list(principal: AuthPrincipal, q: AdminAuctionQuery) {
      return repo.read(async () => {
        await admin(principal);
        const d = q.ordem === 'antigas' ? 1 : -1;
        const [page] = await repo
          .auctions()
          .aggregate<{
            itens: Observed[];
            estados: {
              _id: AuctionState;
              total: number;
              ofertas: number;
              vencedoras: { toString(): string };
            }[];
          }>(
            [
              { $match: adminAuctionFilter(q) },
              { $set: { observadoEm: '$$NOW' } },
              { $sort: { createdAt: d, _id: d } },
              {
                $facet: {
                  itens: [
                    { $skip: (q.pagina - 1) * q.porPagina },
                    { $limit: q.porPagina },
                    { $project: projection },
                  ],
                  estados: [
                    {
                      $group: {
                        _id: '$estado',
                        total: { $sum: 1 },
                        ofertas: { $sum: '$sequencia' },
                        vencedoras: {
                          $sum: {
                            $cond: [
                              {
                                $and: [
                                  { $eq: ['$estado', 'terminado'] },
                                  { $eq: ['$resultado.tipo', 'vencedor'] },
                                ],
                              },
                              { $toDecimal: '$resultado.valorCent' },
                              { $toDecimal: 0 },
                            ],
                          },
                        },
                      },
                    },
                  ],
                },
              },
            ],
            options,
          )
          .toArray();
        const porEstado = Object.fromEntries(
            auctionStates.map((s) => [s, page?.estados.find((e) => e._id === s)?.total ?? 0]),
          ) as Record<AuctionState, number>,
          total = Object.values(porEstado).reduce((a, b) => a + b, 0),
          numeroLicitacoes = (page?.estados ?? []).reduce((a, b) => a + b.ofertas, 0);
        if (!Number.isSafeInteger(numeroLicitacoes) || numeroLicitacoes < 0)
          throw new ApiError(
            503,
            'INDICADORES_INDISPONIVEIS',
            'Não foi possível representar os indicadores com precisão.',
          );
        const winning = (page?.estados ?? []).reduce((sum, row) => {
          const value = Number(row.vencedoras.toString());
          if (!Number.isSafeInteger(value) || value < 0)
            throw new ApiError(
              503,
              'INDICADORES_INDISPONIVEIS',
              'Não foi possível representar os indicadores com precisão.',
            );
          return sum + BigInt(value);
        }, 0n);
        if (winning > BigInt(Number.MAX_SAFE_INTEGER))
          throw new ApiError(
            503,
            'INDICADORES_INDISPONIVEIS',
            'Não foi possível representar os indicadores com precisão.',
          );
        const valorOfertasVencedorasCent = Number(winning);
        return {
          itens: (page?.itens ?? []).map(dto),
          pagina: q.pagina,
          porPagina: q.porPagina,
          total,
          totalPaginas: Math.ceil(total / q.porPagina),
          indicadores: {
            numeroLeiloes: total,
            porEstado,
            numeroLicitacoes,
            valorOfertasVencedorasCent,
          },
        };
      });
    },
    async detail(principal: AuthPrincipal, id: string) {
      return repo.read(async () => {
        await admin(principal);
        const [a] = await repo
          .auctions()
          .aggregate<Observed>(
            [
              { $match: { _id: new Types.ObjectId(id) } },
              { $set: { observadoEm: '$$NOW' } },
              { $project: projection },
            ],
            options,
          )
          .toArray();
        if (!a) throw missing();
        return dto(a);
      });
    },
    async history(principal: AuthPrincipal, id: string, q: OrderListQuery) {
      await admin(principal);
      return repo.transaction(async (session) => {
        const a = await repo
          .auctions()
          .findOne(
            { _id: new Types.ObjectId(id) },
            { session, projection: { _id: 1, sequencia: 1, versao: 1 } },
          );
        if (!a) throw missing();
        const d = q.ordem === 'antigas' ? 1 : -1;
        const rows = await repo
          .bids()
          .find(
            { leilao: a._id, sequencia: { $lte: a.sequencia } },
            {
              session,
              projection: {
                _id: 1,
                leilao: 1,
                comprador: 1,
                valorCent: 1,
                sequencia: 1,
                aceiteEm: 1,
              },
              maxTimeMS: 5000,
            },
          )
          .sort({ sequencia: d, _id: d })
          .skip((q.pagina - 1) * q.porPagina)
          .limit(q.porPagina)
          .toArray();
        return {
          itens: rows.map((b) => ({
            id: b._id.toHexString(),
            leilaoId: b.leilao.toHexString(),
            valorCent: b.valorCent,
            sequencia: b.sequencia,
            aceiteEm: b.aceiteEm.toISOString(),
            participante: { referencia: repo.participant(a as AuctionRecord, b.comprador) },
            confirmada: true as const,
          })),
          pagina: q.pagina,
          porPagina: q.porPagina,
          total: a.sequencia,
          totalPaginas: Math.ceil(a.sequencia / q.porPagina),
          sequenciaSnapshot: a.sequencia,
          versaoSnapshot: a.versao,
          serverNow: (await repo.clock('auctions', a._id, session)).toISOString(),
        };
      });
    },
    // Somente o publicador interno usa estes marcadores, nunca enviados ao browser.
    async versions(ids: readonly string[]) {
      if (ids.length > 1000) throw Error('Lote de marcadores excessivo.');
      return repo.read(async () =>
        repo
          .auctions()
          .find(
            { _id: { $in: ids.map((id) => new Types.ObjectId(id)) } },
            { projection: { _id: 1, versao: 1 }, maxTimeMS: 5000 },
          )
          .toArray(),
      );
    },
  };
}
export type AdminAuctionsService = ReturnType<typeof createAdminAuctionsService>;
