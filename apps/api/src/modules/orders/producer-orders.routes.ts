import { Router } from 'express';
import type { AuthService } from '../auth/auth.service.js';
import { unauthorized } from '../auth/auth.service.js';
import { createAccessControl } from '../auth/access-control.js';
import { ApiError } from '../../http/api-error.js';
import { validate } from '../../http/validate.js';
import { orderParams, emptyOrderQuery } from './orders.validation.js';
import { producerOrderQuery, producerStatusBody } from './producer-orders.policy.js';
import type { ProducerOrdersService } from './producer-orders.service.js';

export function producerOrdersRoutes(service: ProducerOrdersService, auth?: AuthService) {
  const router = Router(),
    access = auth ? createAccessControl(auth) : undefined;
  router.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  router.use(
    access?.authenticate ??
      (() => {
        throw unauthorized();
      }),
    access?.requireRoles('produtor') ??
      (() => {
        throw unauthorized();
      }),
  );
  router.get(
    '/',
    validate(producerOrderQuery, (req) => req.query),
    async (req, res) => {
      res.json(await service.list(access!.principal(req), res.locals.validated));
    },
  );
  router.get(
    '/:id',
    validate(orderParams, (req) => req.params),
    validate(emptyOrderQuery, (req) => req.query),
    async (req, res) => {
      const result = await service.detail(access!.principal(req), String(req.params.id));
      res.setHeader('ETag', result.etag);
      res.json(result.body);
    },
  );
  router.patch(
    '/:id/status',
    validate(orderParams, (req) => req.params),
    validate(emptyOrderQuery, (req) => req.query),
    (req, _res, next) => {
      if (!req.is('application/json'))
        throw new ApiError(415, 'CONTEUDO_NAO_SUPORTADO', 'Utiliza application/json.');
      next();
    },
    validate(producerStatusBody, (req) => req.body),
    async (req, res) => {
      const headers = req.headersDistinct['if-match'];
      if (headers && headers.length !== 1)
        throw new ApiError(
          400,
          'IF_MATCH_INVALIDO',
          'Envia um único ETag forte recebido do servidor.',
        );
      const result = await service.status(
        access!.principal(req),
        String(req.params.id),
        res.locals.validated.estado,
        headers?.[0],
      );
      res.setHeader('ETag', result.etag);
      res.json(result.body);
    },
  );
  return router;
}
