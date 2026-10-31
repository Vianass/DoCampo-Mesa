import { createHmac, randomUUID } from 'node:crypto';
import { Error as MongooseError, Types, type Connection } from 'mongoose';
import { z } from 'zod';
import { ApiError } from '../../http/api-error.js';
import type { AuthPrincipal } from '../auth/auth.service.js';
import { guardUserCapabilities, UserCapabilityError } from '../users/user-capability.repository.js';
import { ConcurrencyError } from '../concurrency/concurrency-error.js';
import { createOrderModel } from './order.model.js';
import { buyerOrderDetailDto } from './orders.dto.js';
import { isCheckoutReadUnavailable } from './checkout.idempotency.js';
import type { OrderRecord } from './order.types.js';

export const confirmReceiptInput = z.strictObject({ confirmarRececao: z.literal(true) });
export function receiptMetadata(order: OrderRecord) {
  return {
    versao: order.versao,
    podeConfirmarRececao: order.estado === 'pronta',
    rececao: {
      confirmadaEm: order.rececao.confirmacaoRececaoEm?.toISOString() ?? null,
      concluidaEm: order.rececao.concluidaEm?.toISOString() ?? null,
    },
  };
}
export function createOrderReceiptService(connection: Connection, key: Uint8Array) {
  const Order = createOrderModel(connection);
  function etag(user: AuthPrincipal, order: { id: string; versao: number }) {
    return (
      '"' +
      createHmac('sha256', key)
        .update(`buyer-order-v1:${user.id}:${order.id}:${order.versao}`)
        .digest('base64url') +
      '"'
    );
  }
  return {
    etag,
    async confirm(user: AuthPrincipal, id: string, match?: string) {
      if (!user.papeis.includes('comprador'))
        throw new ApiError(403, 'ACESSO_PROIBIDO', 'Apenas o comprador pode confirmar a receção.');
      const owner = new Types.ObjectId(user.id),
        session = await connection.startSession();
      let attempts = 0;
      try {
        return await session.withTransaction(
          async () => {
            if (++attempts > 5)
              throw new ConcurrencyError('CONFLITO_VERSAO', 'Conflito concorrente.');
            await guardUserCapabilities(connection, owner, ['comprador'], session);
            const document = await Order.findOne({ _id: new Types.ObjectId(id), comprador: owner })
              .session(session)
              .maxTimeMS(5000);
            if (!document)
              throw new ApiError(
                404,
                'ENCOMENDA_NAO_ENCONTRADA',
                'A encomenda não está disponível.',
              );
            if (!match)
              throw new ApiError(428, 'PRECONDICAO_OBRIGATORIA', 'Envia o ETag atual em If-Match.');
            if (!/^"[A-Za-z0-9_-]{43}"$/.test(match))
              throw new ApiError(400, 'IF_MATCH_INVALIDO', 'Envia um único ETag forte.');
            const current = () => etag(user, { id, versao: document.versao });
            const completion = document.rececao.historico.find(
              (e) => e.tipo === 'rececao_confirmada_comprador',
            );
            // Recupera apenas a confirmação deste comprador e o seu ETag observado, nunca uma conclusão alheia.
            if (
              document.estado === 'concluida' &&
              document.rececao.modoConclusao === 'comprador' &&
              completion?.ator.tipo === 'utilizador' &&
              completion.ator.userId.equals(owner) &&
              (match === current() ||
                match === etag(user, { id, versao: completion.versaoObservada }))
            ) {
              return {
                body: {
                  ...buyerOrderDetailDto(document.toObject({ transform: false })),
                  ...receiptMetadata(document),
                  origem: 'recuperada' as const,
                },
                etag: current(),
              };
            }
            if (match !== current())
              throw new ApiError(
                412,
                'PRECONDICAO_FALHOU',
                'A encomenda mudou. Consulta-a antes de confirmar.',
              );
            if (document.estado !== 'pronta')
              throw new ApiError(
                409,
                'TRANSICAO_INDISPONIVEL',
                'A receção só pode ser confirmada numa encomenda pronta.',
              );
            const now = new Date(),
              comandoId = randomUUID(),
              ator = {
                tipo: 'utilizador' as const,
                userId: owner,
                papelNaAcao: 'comprador' as const,
              };
            document.set('estado', 'concluida');
            document.set('historicoEstado', [
              ...document.historicoEstado,
              {
                id: randomUUID(),
                comandoId,
                tipo: 'rececao_confirmada_comprador',
                ator,
                ocorridoEm: now,
                de: 'pronta',
                para: 'concluida',
                versaoObservada: document.versao,
              },
            ]);
            document.set('rececao', {
              ...(document.toObject({ transform: false }) as OrderRecord).rececao,
              confirmacaoRececaoEm: now,
              concluidaEm: now,
              modoConclusao: 'comprador',
              ultimoInicioEm: null,
              pausadoDesde: null,
              limiteAtualEm: null,
              historico: [
                ...document.rececao.historico,
                {
                  id: randomUUID(),
                  comandoId,
                  tipo: 'rececao_confirmada_comprador',
                  ator,
                  ocorridoEm: now,
                  versaoObservada: document.versao,
                },
              ],
            });
            await document.save({ session });
            return {
              body: {
                ...buyerOrderDetailDto(document.toObject({ transform: false })),
                ...receiptMetadata(document),
                origem: 'nova' as const,
              },
              etag: current(),
            };
          },
          {
            readConcern: { level: 'snapshot' },
            writeConcern: { w: 'majority' },
            readPreference: 'primary',
            timeoutMS: 10000,
          },
        );
      } catch (e) {
        if (e instanceof UserCapabilityError)
          throw new ApiError(
            403,
            'ACESSO_PROIBIDO',
            'A capacidade de comprador deixou de estar disponível.',
          );
        if (e instanceof ConcurrencyError || e instanceof MongooseError.VersionError)
          throw new ApiError(
            409,
            'CONFLITO_REVISAO',
            'A encomenda mudou. Consulta-a antes de repetir.',
          );
        if (e instanceof MongooseError.ValidationError)
          throw new ApiError(
            409,
            'TRANSICAO_INDISPONIVEL',
            'A encomenda não permite esta confirmação.',
          );
        if (isCheckoutReadUnavailable(e))
          throw new ApiError(
            503,
            'RESULTADO_INDETERMINADO',
            'Consulta a encomenda antes de repetir a confirmação.',
          );
        throw e;
      } finally {
        await session.endSession();
      }
    },
  };
}
export type OrderReceiptService = ReturnType<typeof createOrderReceiptService>;
