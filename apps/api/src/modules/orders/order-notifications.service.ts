import { Types, type Connection } from 'mongoose';
import { ApiError } from '../../http/api-error.js';
import type { AuthPrincipal } from '../auth/auth.service.js';
import type { OrderRecord } from './order.types.js';
import type { OrderUpdate } from '../../realtime/order.protocol.js';
export function createOrderNotificationsService(connection: Connection) {
  return {
    async versions(user: AuthPrincipal): Promise<OrderUpdate[]> {
      const id = new Types.ObjectId(user.id),
        filters = [];
      if (user.papeis.includes('comprador')) filters.push({ comprador: id });
      if (user.papeis.includes('produtor')) filters.push({ produtor: id });
      if (!filters.length)
        throw new ApiError(403, 'ACESSO_PROIBIDO', 'Não tens acesso a esta subscrição.');
      const rows = await connection
        .db!.collection<OrderRecord>('orders')
        .find(
          { $or: filters },
          {
            projection: { _id: 1, estado: 1, versao: 1, updatedAt: 1 },
            maxTimeMS: 5000,
            readConcern: { level: 'majority' },
            readPreference: 'primary',
          },
        )
        .limit(1001)
        .toArray();
      if (rows.length > 1000)
        throw new ApiError(503, 'SUBSCRICAO_INDISPONIVEL', 'Consulta as encomendas pela API.');
      return rows.map((r) => ({
        encomendaId: r._id.toHexString(),
        estado: r.estado,
        versao: r.versao,
        atualizadaEm: r.updatedAt.toISOString(),
      }));
    },
  };
}
export type OrderNotificationsService = ReturnType<typeof createOrderNotificationsService>;
