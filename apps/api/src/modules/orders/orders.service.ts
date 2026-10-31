import { receiptMetadata } from './order-receipt.service.js';
import { Types, type Connection } from 'mongoose';
import type { AuthPrincipal } from '../auth/auth.service.js';
import { ApiError } from '../../http/api-error.js';
import { createCheckoutService } from './checkout.service.js';
import type { CheckoutDependencies } from './checkout.service.js';
import { createOrderModel } from './order.model.js';
import type { OrderRecord } from './order.types.js';
import { buyerOrderDetailDto, buyerOrderDto, checkoutHttpResponse } from './orders.dto.js';
import type { OrderListQuery } from './orders.validation.js';
import { isCheckoutReadUnavailable } from './checkout.idempotency.js';

// Sem chave, hash, manifesto, versões técnicas, auditoria privada ou identidade de outros compradores.
const projection = {
  _id: 1,
  operacaoCompraId: 1,
  produtor: 1,
  linhas: 1,
  subtotalProdutosCent: 1,
  taxaEntregaCent: 1,
  totalCent: 1,
  moeda: 1,
  estado: 1,
  'pagamento.metodo': 1,
  'pagamento.estado': 1,
  createdAt: 1,
  updatedAt: 1,
};
function buyer(principal: AuthPrincipal) {
  if (!principal.papeis.includes('comprador'))
    throw new ApiError(403, 'ACESSO_PROIBIDO', 'Não tens acesso a esta operação.');
  return new Types.ObjectId(principal.id);
}
async function producerLabels(connection: Connection, accounts: readonly Types.ObjectId[]) {
  const ids = [...new Map(accounts.map((id) => [id.toHexString(), id])).values()];
  const result = new Map<string, { perfilId: string; nomePublico: string }>();
  if (!ids.length) return result;
  const profiles = await connection
    .db!.collection('producers')
    .find(
      { userId: { $in: ids } },
      { projection: { _id: 1, userId: 1, nomePublico: 1 }, maxTimeMS: 5000 },
    )
    .toArray();
  for (const profile of profiles)
    if (profile.userId instanceof Types.ObjectId && typeof profile.nomePublico === 'string')
      result.set(profile.userId.toHexString(), {
        perfilId: profile._id.toHexString(),
        nomePublico: profile.nomePublico,
      });
  return result;
}
async function read<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (isCheckoutReadUnavailable(error))
      throw new ApiError(503, 'SERVICO_INDISPONIVEL', 'Não foi possível consultar as encomendas.');
    throw error;
  }
}
export function createOrdersService(
  connection: Connection,
  options: Pick<CheckoutDependencies, 'now'> = {},
) {
  const Order = createOrderModel(connection);
  const collection = () => connection.db!.collection<OrderRecord>('orders');
  return {
    async prepare() {
      // Obrigatório antes de listen: índice global de idempotência já definido pelo modelo.
      await Order.createCollection();
      await Order.createIndexes();
    },
    async checkout(principal: AuthPrincipal, key: unknown, body: unknown) {
      buyer(principal);
      try {
        const checkout = createCheckoutService({
          connection,
          ...options,
          resolveIdentity: async () => ({ compradorContaId: principal.id }),
        });
        return checkoutHttpResponse(await checkout(key, body));
      } catch (error) {
        if (isCheckoutReadUnavailable(error))
          return checkoutHttpResponse({
            tipo: 'resultado_indeterminado',
            codigo: 'RESULTADO_DESCONHECIDO',
            repetirComMesmaChave: true,
          });
        throw error;
      }
    },
    async list(principal: AuthPrincipal, query: OrderListQuery) {
      const owner = buyer(principal);
      return read(async () => {
        const direction = query.ordem === 'recentes' ? -1 : 1;
        const [page] = await collection()
          .aggregate<{
            itens: OrderRecord[];
            contagem: { total: number }[];
          }>(
            [
              { $match: { comprador: owner } },
              { $sort: { createdAt: direction, _id: direction } },
              {
                $facet: {
                  itens: [
                    { $skip: (query.pagina - 1) * query.porPagina },
                    { $limit: query.porPagina },
                    { $project: projection },
                  ],
                  contagem: [{ $count: 'total' }],
                },
              },
            ],
            { maxTimeMS: 5000, readConcern: { level: 'majority' }, readPreference: 'primary' },
          )
          .toArray();
        const total = page?.contagem[0]?.total ?? 0;
        const orders = page?.itens ?? [];
        const labels = await producerLabels(
          connection,
          orders.map((order) => order.produtor),
        );
        return {
          itens: orders.map((order) => {
            const produtor = labels.get(order.produtor.toHexString());
            return { ...buyerOrderDto(order), ...(produtor ? { produtor } : {}) };
          }),
          pagina: query.pagina,
          porPagina: query.porPagina,
          total,
          totalPaginas: Math.ceil(total / query.porPagina),
        };
      });
    },
    async detail(principal: AuthPrincipal, id: string) {
      const owner = buyer(principal);
      return read(async () => {
        const record = await collection().findOne(
          { _id: new Types.ObjectId(id), comprador: owner },
          {
            projection: {
              ...projection,
              versao: 1,
              rececao: 1,
              'entrega.snapshot': 1,
              historicoEstado: 1,
            },
            maxTimeMS: 5000,
            readConcern: { level: 'majority' },
            readPreference: 'primary',
          },
        );
        if (!record)
          throw new ApiError(404, 'ENCOMENDA_NAO_ENCONTRADA', 'A encomenda não está disponível.');
        const produtor = (await producerLabels(connection, [record.produtor])).get(
          record.produtor.toHexString(),
        );
        return {
          ...buyerOrderDetailDto(record),
          ...receiptMetadata(record),
          ...(produtor ? { produtor } : {}),
        };
      });
    },
  };
}
export type OrdersService = ReturnType<typeof createOrdersService>;
