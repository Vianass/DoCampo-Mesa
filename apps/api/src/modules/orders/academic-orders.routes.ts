import { Router } from 'express';
import { z } from 'zod';
import { ApiError } from '../../http/api-error.js';
import { validate } from '../../http/validate.js';
import { createAccessControl } from '../auth/access-control.js';
import { unauthorized, type AuthService } from '../auth/auth.service.js';
import { createAuctionRateLimit } from '../auctions/auction-rate-limit.js';
import { producerStatusBody } from './producer-orders.policy.js';
import { orderParams, emptyOrderQuery } from './orders.validation.js';
import type { ProducerOrdersService } from './producer-orders.service.js';
import type { OrderReceiptService } from './order-receipt.service.js';
export const academicStatusInput = z.discriminatedUnion('estado', [
  producerStatusBody,
  z.strictObject({ estado: z.literal('entregue'), confirmarRececao: z.literal(true) }),
]);
export function academicOrderResponse<T extends { estado: string }>(body: T) {
  return {
    ...body,
    estadoPersistido: body.estado,
    estado: body.estado === 'concluida' ? 'entregue' : body.estado,
  };
}
/** Compatibilidade literal da p.17/22: usa exclusivamente os comandos transacionais existentes. */
export function academicOrdersRoutes(
  producer: ProducerOrdersService,
  receipt: OrderReceiptService,
  auth?: AuthService,
) {
  const router = Router(),
    access = auth ? createAccessControl(auth) : undefined,
    rate = createAuctionRateLimit({ ipLimit: 240, accountLimit: 60 });
  router.patch(
    '/:id/estado',
    rate.byIp,
    access?.authenticate ??
      (() => {
        throw unauthorized();
      }),
    (req, res, next) => {
      res.setHeader('Cache-Control', 'no-store');
      rate.account(access!.principal(req).id, res);
      next();
    },
    validate(orderParams, (req) => req.params),
    validate(emptyOrderQuery, (req) => req.query),
    (req, _res, next) => {
      if (!req.is('application/json'))
        throw new ApiError(415, 'CONTEUDO_NAO_SUPORTADO', 'Utiliza application/json.');
      next();
    },
    validate(academicStatusInput, (req) => req.body),
    async (req, res) => {
      const body = academicStatusInput.parse(req.body),
        user = access!.principal(req),
        headers = req.headersDistinct['if-match'];
      if (headers && headers.length !== 1)
        throw new ApiError(400, 'IF_MATCH_INVALIDO', 'Envia um único ETag forte.');
      const id = String(req.params.id).toLowerCase();
      if (body.estado === 'entregue') {
        if (!user.papeis.includes('comprador'))
          throw new ApiError(403, 'ACESSO_PROIBIDO', 'Apenas o comprador confirma a receção.');
        const r = await receipt.confirm(user, id, headers?.[0]);
        res.setHeader('ETag', r.etag).json(academicOrderResponse(r.body));
      } else {
        if (!user.papeis.includes('produtor'))
          throw new ApiError(403, 'ACESSO_PROIBIDO', 'Apenas o produtor gere a preparação.');
        const r = await producer.status(user, id, body.estado, headers?.[0]);
        res.setHeader('ETag', r.etag).json(academicOrderResponse(r.body));
      }
    },
  );
  return router;
}
