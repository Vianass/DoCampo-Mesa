import { Types, type Connection } from 'mongoose';
import { ApiError } from '../../http/api-error.js';
import { unauthorized, type AuthPrincipal } from '../auth/auth.service.js';
import { orderStates } from '../orders/order.constants.js';
import type { OrderAuditEvent, OrderRecord, OrderState } from '../orders/order.types.js';
import { buyerOrderDto } from '../orders/orders.dto.js';
import { isCheckoutReadUnavailable } from '../orders/checkout.idempotency.js';
import type { AdminOrderQuery, AdminOrderHistoryQuery } from './admin-orders.validation.js';
const summaryProjection = {
  _id: 1,
  comprador: 1,
  produtor: 1,
  estado: 1,
  totalCent: 1,
  moeda: 1,
  'pagamento.metodo': 1,
  'pagamento.estado': 1,
  'entrega.snapshot.tipo': 1,
  createdAt: 1,
};
export function adminOrderFilter(query: AdminOrderQuery) {
  const filter: Record<string, unknown> = {};
  for (const key of ['produtor', 'comprador'] as const)
    if (query[key]) filter[key] = new Types.ObjectId(query[key]);
  if (query.identificador) filter._id = new Types.ObjectId(query.identificador);
  if (query.estado) filter.estado = query.estado;
  if (query.pagamento) filter['pagamento.estado'] = query.pagamento;
  if (query.desde || query.ate)
    filter.createdAt = {
      ...(query.desde ? { $gte: new Date(query.desde + 'T00:00:00.000Z') } : {}),
      ...(query.ate ? { $lt: new Date(Date.parse(query.ate + 'T00:00:00.000Z') + 86400000) } : {}),
    };
  return filter;
}
export function adminOrderEvent(event: OrderAuditEvent) {
  return {
    tipo: event.tipo,
    ocorridoEm: event.ocorridoEm.toISOString(),
    ...(event.de !== undefined ? { de: event.de } : {}),
    ...(event.para !== undefined ? { para: event.para } : {}),
    ...(event.ator
      ? {
          responsavel:
            event.ator.tipo === 'utilizador'
              ? {
                  tipo: 'utilizador' as const,
                  contaId: event.ator.userId.toHexString(),
                  papel: event.ator.papelNaAcao,
                }
              : { tipo: 'sistema' as const },
        }
      : {}),
    ...(event.justificacao ? { justificacao: event.justificacao } : {}),
  };
}
export function createAdminOrdersService(connection: Connection) {
  const orders = () => connection.db!.collection<OrderRecord>('orders');
  async function admin(principal: AuthPrincipal) {
    const actor = await connection
      .db!.collection('users')
      .findOne(
        { _id: new Types.ObjectId(principal.id) },
        { projection: { ativo: 1, papeis: 1 }, maxTimeMS: 5000 },
      );
    if (!actor || actor.ativo === false) throw unauthorized();
    if (!Array.isArray(actor.papeis) || !actor.papeis.includes('administrador'))
      throw new ApiError(403, 'ACESSO_PROIBIDO', 'Não tens acesso a esta operação.');
  }
  async function read<T>(principal: AuthPrincipal, operation: () => Promise<T>): Promise<T> {
    try {
      await admin(principal);
      return await operation();
    } catch (error) {
      if (isCheckoutReadUnavailable(error))
        throw new ApiError(
          503,
          'SERVICO_INDISPONIVEL',
          'Não foi possível consultar as encomendas.',
        );
      throw error;
    }
  }
  async function labels(rows: OrderRecord[]) {
    const ids = [
      ...new Map(
        rows.flatMap((r) => [r.comprador, r.produtor]).map((id) => [id.toHexString(), id]),
      ).values(),
    ];
    const names = new Map<string, string>();
    if (ids.length) {
      const users = await connection
        .db!.collection('users')
        .find({ _id: { $in: ids } }, { projection: { _id: 1, nome: 1 }, maxTimeMS: 5000 })
        .toArray();
      for (const user of users)
        if (typeof user.nome === 'string') names.set(user._id.toHexString(), user.nome);
    }
    return (id: Types.ObjectId) => ({
      contaId: id.toHexString(),
      nomeAtual: names.get(id.toHexString()) ?? null,
    });
  }
  const options = {
    maxTimeMS: 5000,
    readConcern: { level: 'majority' as const },
    readPreference: 'primary' as const,
  };
  const missing = () =>
    new ApiError(404, 'ENCOMENDA_NAO_ENCONTRADA', 'A encomenda não está disponível.');
  return {
    async list(principal: AuthPrincipal, query: AdminOrderQuery) {
      return read(principal, async () => {
        const direction = query.ordem === 'recentes' ? -1 : 1;
        const [page] = await orders()
          .aggregate<{ itens: OrderRecord[]; estados: { _id: OrderState; total: number }[] }>(
            [
              { $match: adminOrderFilter(query) },
              { $sort: { createdAt: direction, _id: direction } },
              {
                $facet: {
                  itens: [
                    { $skip: (query.pagina - 1) * query.porPagina },
                    { $limit: query.porPagina },
                    { $project: summaryProjection },
                  ],
                  estados: [{ $group: { _id: '$estado', total: { $sum: 1 } } }],
                },
              },
            ],
            options,
          )
          .toArray();
        const states = Object.fromEntries(
          orderStates.map((s) => [s, page?.estados.find((e) => e._id === s)?.total ?? 0]),
        ) as Record<OrderState, number>;
        const total = Object.values(states).reduce((a, b) => a + b, 0);
        const rows = page?.itens ?? [],
          label = await labels(rows);
        return {
          itens: rows.map((r) => ({
            id: r._id.toHexString(),
            criadaEm: r.createdAt.toISOString(),
            comprador: label(r.comprador),
            produtor: label(r.produtor),
            totalCent: r.totalCent,
            moeda: r.moeda,
            estado: r.estado,
            pagamento: { metodo: r.pagamento.metodo, estado: r.pagamento.estado },
            modalidade: r.entrega.snapshot.tipo,
          })),
          pagina: query.pagina,
          porPagina: query.porPagina,
          total,
          totalPaginas: Math.ceil(total / query.porPagina),
          indicadores: { numeroEncomendas: total, porEstado: states },
        };
      });
    },
    async detail(principal: AuthPrincipal, id: string) {
      return read(principal, async () => {
        const r = await orders().findOne(
          { _id: new Types.ObjectId(id) },
          {
            ...options,
            projection: {
              _id: 1,
              comprador: 1,
              produtor: 1,
              estado: 1,
              totalCent: 1,
              moeda: 1,
              pagamento: { metodo: 1, estado: 1 },
              createdAt: 1,
              operacaoCompraId: 1,
              linhas: 1,
              subtotalProdutosCent: 1,
              taxaEntregaCent: 1,
              updatedAt: 1,
              'entrega.snapshot': 1,
            },
          },
        );
        if (!r) throw missing();
        const label = await labels([r]),
          d = r.entrega.snapshot;
        return {
          ...buyerOrderDto(r),
          comprador: label(r.comprador),
          participanteProdutor: label(r.produtor),
          entrega: {
            modalidade: d.tipo,
            periodoInicial: {
              inicioEm: d.periodoInicial.inicioEm.toISOString(),
              fimEm: d.periodoInicial.fimEm.toISOString(),
              fusoHorario: d.periodoInicial.fusoHorario,
            },
            ...(d.tipo === 'levantamento'
              ? { localLevantamento: d.localLevantamento }
              : { concelhoId: d.concelhoId, morada: d.morada }),
          },
        };
      });
    },
    async history(principal: AuthPrincipal, id: string, query: AdminOrderHistoryQuery) {
      return read(principal, async () => {
        const source =
          query.dominio === 'operacional' ? '$historicoEstado' : '$pagamento.historico';
        const direction = query.ordem === 'recentes' ? -1 : 1;
        const [page] = await orders()
          .aggregate<{ itens: { evento: OrderAuditEvent }[]; contagem: { total: number }[] }>(
            [
              { $match: { _id: new Types.ObjectId(id) } },
              { $project: { eventos: { $ifNull: [source, []] } } },
              {
                $facet: {
                  itens: [
                    { $unwind: { path: '$eventos', includeArrayIndex: 'posicao' } },
                    { $sort: { 'eventos.ocorridoEm': direction, posicao: direction } },
                    { $skip: (query.pagina - 1) * query.porPagina },
                    { $limit: query.porPagina },
                    { $project: { _id: 0, evento: '$eventos' } },
                  ],
                  contagem: [{ $project: { total: { $size: '$eventos' } } }],
                },
              },
            ],
            options,
          )
          .toArray();
        if (!page?.contagem.length) throw missing();
        const total = page.contagem[0]!.total;
        return {
          itens: page.itens.map((e) => adminOrderEvent(e.evento)),
          dominio: query.dominio,
          pagina: query.pagina,
          porPagina: query.porPagina,
          total,
          totalPaginas: Math.ceil(total / query.porPagina),
        };
      });
    },
  };
}
export type AdminOrdersService = ReturnType<typeof createAdminOrdersService>;
