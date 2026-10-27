import { createHmac, randomUUID } from 'node:crypto';
import { Error as MongooseError, Types, type ClientSession, type Connection } from 'mongoose';
import { ApiError } from '../../http/api-error.js';
import type { AuthPrincipal } from '../auth/auth.service.js';
import { ConcurrencyError } from '../concurrency/concurrency-error.js';
import { guardUserCapabilities, UserCapabilityError } from '../users/user-capability.repository.js';
import { createOrderModel } from './order.model.js';
import { orderStates } from './order.constants.js';
import { buyerOrderDetailDto, buyerOrderDto } from './orders.dto.js';
import { isCheckoutReadUnavailable } from './checkout.idempotency.js';
import { producerTransitions, type ProducerOrderQuery } from './producer-orders.policy.js';
import type { OrderRecord, OrderState } from './order.types.js';

const projection = {
  _id: 1,
  produtor: 1,
  operacaoCompraId: 1,
  estado: 1,
  linhas: 1,
  subtotalProdutosCent: 1,
  taxaEntregaCent: 1,
  totalCent: 1,
  moeda: 1,
  'pagamento.metodo': 1,
  'pagamento.estado': 1,
  createdAt: 1,
  updatedAt: 1,
};
function producer(user: AuthPrincipal) {
  if (!user.papeis.includes('produtor'))
    throw new ApiError(403, 'ACESSO_PROIBIDO', 'Não tens acesso a esta operação.');
  return new Types.ObjectId(user.id);
}
function failure(error: unknown, writing = false): never {
  if (error instanceof UserCapabilityError)
    throw new ApiError(
      403,
      'ACESSO_PROIBIDO',
      'A capacidade de produtor deixou de estar disponível.',
    );
  if (
    error instanceof ConcurrencyError ||
    error instanceof MongooseError.VersionError ||
    error instanceof MongooseError.DocumentNotFoundError
  )
    throw new ApiError(409, 'CONFLITO_REVISAO', 'A encomenda mudou. Consulta-a antes de repetir.');
  if (error instanceof MongooseError.ValidationError)
    throw new ApiError(409, 'TRANSICAO_INDISPONIVEL', 'A encomenda não permite esta alteração.');
  if (isCheckoutReadUnavailable(error))
    throw new ApiError(
      503,
      writing ? 'RESULTADO_INDETERMINADO' : 'SERVICO_INDISPONIVEL',
      writing
        ? 'Consulta a encomenda para confirmar o resultado antes de repetir.'
        : 'Não foi possível consultar as encomendas.',
    );
  throw error;
}
function unavailable(): never {
  throw new ApiError(404, 'ENCOMENDA_NAO_ENCONTRADA', 'A encomenda não está disponível.');
}
export function createProducerOrdersService(connection: Connection, key: string | Buffer) {
  const Order = createOrderModel(connection);
  const collection = () => connection.db!.collection<OrderRecord>('orders');
  function tag(record: Pick<OrderRecord, '_id' | 'produtor' | 'versao'>) {
    return (
      '"' +
      createHmac('sha256', key)
        .update(`producer-order-v1:${record.produtor}:${record._id}:${record.versao}`)
        .digest('base64url') +
      '"'
    );
  }
  function detail(record: OrderRecord) {
    return {
      body: { ...buyerOrderDetailDto(record), acoesPermitidas: producerTransitions(record.estado) },
      etag: tag(record),
    };
  }
  return {
    async list(user: AuthPrincipal, query: ProducerOrderQuery) {
      const owner = producer(user);
      const state = query.estado ? { estado: query.estado } : {};
      const direction = query.ordem === 'recentes' ? -1 : 1;
      try {
        const [result] = await collection()
          .aggregate<{
            itens: OrderRecord[];
            contagem: { total: number }[];
            estados: { _id: OrderState; total: number; valor: { toString(): string } }[];
          }>(
            [
              { $match: { produtor: owner } },
              {
                $facet: {
                  itens: [
                    { $match: state },
                    { $sort: { createdAt: direction, _id: direction } },
                    { $skip: (query.pagina - 1) * query.porPagina },
                    { $limit: query.porPagina },
                    { $project: { ...projection, 'entrega.snapshot.tipo': 1 } },
                  ],
                  contagem: [{ $match: state }, { $count: 'total' }],
                  estados: [
                    {
                      $group: {
                        _id: '$estado',
                        total: { $sum: 1 },
                        valor: { $sum: { $toDecimal: '$totalCent' } },
                      },
                    },
                  ],
                },
              },
            ],
            { maxTimeMS: 5000, readConcern: { level: 'majority' }, readPreference: 'primary' },
          )
          .toArray();
        const total = result?.contagem[0]?.total ?? 0;
        const porEstado = Object.fromEntries(
          orderStates.map((s) => [s, result?.estados.find((e) => e._id === s)?.total ?? 0]),
        ) as Record<OrderState, number>;
        const valorConcluidasCent = Number(
          result?.estados.find((e) => e._id === 'concluida')?.valor.toString() ?? 0,
        );
        if (!Number.isSafeInteger(valorConcluidasCent) || valorConcluidasCent < 0)
          throw new ApiError(
            503,
            'INDICADORES_INDISPONIVEIS',
            'O valor agregado não pode ser representado com precisão.',
          );
        return {
          itens: (result?.itens ?? []).map((record) => ({
            ...buyerOrderDto(record),
            modalidade: record.entrega.snapshot.tipo,
          })),
          pagina: query.pagina,
          porPagina: query.porPagina,
          total,
          totalPaginas: Math.ceil(total / query.porPagina),
          indicadores: {
            numeroEncomendas: Object.values(porEstado).reduce((a, b) => a + b, 0),
            porEstado,
            valorConcluidasCent,
            estadoVendas: 'concluida' as const,
          },
        };
      } catch (error) {
        return failure(error);
      }
    },
    async detail(user: AuthPrincipal, id: string) {
      const owner = producer(user);
      try {
        const record = await collection().findOne(
          { _id: new Types.ObjectId(id), produtor: owner },
          {
            projection: { ...projection, versao: 1, 'entrega.snapshot': 1, historicoEstado: 1 },
            maxTimeMS: 5000,
            readConcern: { level: 'majority' },
            readPreference: 'primary',
          },
        );
        if (!record) return unavailable();
        return detail(record);
      } catch (error) {
        return failure(error);
      }
    },
    async status(user: AuthPrincipal, id: string, state: OrderState, match?: string) {
      const owner = producer(user);
      const session = await connection.startSession();
      let attempts = 0;
      try {
        return await session.withTransaction(
          async (session: ClientSession) => {
            if (++attempts > 3)
              throw new ConcurrencyError('CONFLITO_VERSAO', 'Conflito concorrente.');
            const document = await Order.findOne({ _id: new Types.ObjectId(id), produtor: owner })
              .session(session)
              .maxTimeMS(5000);
            if (!document) return unavailable();
            if (!match)
              throw new ApiError(428, 'PRECONDICAO_OBRIGATORIA', 'Envia o ETag atual em If-Match.');
            if (!/^"[A-Za-z0-9_-]{43}"$/.test(match))
              throw new ApiError(
                400,
                'IF_MATCH_INVALIDO',
                'Envia um único ETag forte recebido do servidor.',
              );
            if (tag(document) !== match)
              throw new ApiError(
                412,
                'PRECONDICAO_FALHOU',
                'A encomenda mudou. Consulta-a antes de repetir.',
              );
            if (!producerTransitions(document.estado).includes(state))
              throw new ApiError(
                409,
                'TRANSICAO_INDISPONIVEL',
                'Esta transição não é permitida para o produtor.',
              );
            await guardUserCapabilities(connection, owner, ['produtor'], session);
            const before = document.estado;
            document.set('estado', state);
            document.set('historicoEstado', [
              ...document.historicoEstado,
              {
                id: randomUUID(),
                comandoId: randomUUID(),
                tipo: 'estado_atualizado_produtor',
                ator: { tipo: 'utilizador', userId: owner, papelNaAcao: 'produtor' },
                ocorridoEm: new Date(),
                de: before,
                para: state,
                versaoObservada: document.versao,
              },
            ]);
            await document.save({ session });
            return detail(document.toObject({ transform: false }) as OrderRecord);
          },
          {
            readConcern: { level: 'snapshot' },
            writeConcern: { w: 'majority' },
            readPreference: 'primary',
            timeoutMS: 10000,
          },
        );
      } catch (error) {
        return failure(error, true);
      } finally {
        await session.endSession();
      }
    },
  };
}
export type ProducerOrdersService = ReturnType<typeof createProducerOrdersService>;
