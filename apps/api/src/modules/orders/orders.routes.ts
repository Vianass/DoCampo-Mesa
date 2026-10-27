import { Router, type RequestHandler } from 'express';
import type { AuthService } from '../auth/auth.service.js';
import { unauthorized } from '../auth/auth.service.js';
import { createAccessControl } from '../auth/access-control.js';
import { validate } from '../../http/validate.js';
import { ApiError } from '../../http/api-error.js';
import type { OrdersService } from './orders.service.js';
import { emptyOrderQuery, orderListQuery, orderParams } from './orders.validation.js';

export function ordersRoutes(service: OrdersService, auth?: AuthService) {
  const router = Router();
  router.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  const access = auth ? createAccessControl(auth) : undefined;
  const unavailable: RequestHandler = () => {
    throw unauthorized();
  };
  router.use(access?.authenticate ?? unavailable, access?.requireRoles('comprador') ?? unavailable);
  router.post(
    '/',
    validate(emptyOrderQuery, (req) => req.query),
    async (req, res) => {
      if (!req.is('application/json'))
        throw new ApiError(415, 'CONTEUDO_NAO_SUPORTADO', 'Utiliza application/json.');
      const values = req.headersDistinct['idempotency-key'];
      // Rejeitar headers duplicados: não interpretar a junção automática como uma nova chave lógica.
      const key = values?.length === 1 ? values[0] : undefined;
      const result = await service.checkout(access!.principal(req), key, req.body);
      if (result.location) res.setHeader('Location', result.location);
      res.status(result.status).json(result.body);
    },
  );
  router.get(
    '/',
    validate(orderListQuery, (req) => req.query),
    async (req, res) => {
      res.json(await service.list(access!.principal(req), res.locals.validated));
    },
  );
  router.get(
    '/:id',
    validate(orderParams, (req) => req.params),
    validate(emptyOrderQuery, (req) => req.query),
    async (req, res) => {
      res.json(await service.detail(access!.principal(req), String(req.params.id).toLowerCase()));
    },
  );
  return router;
}
