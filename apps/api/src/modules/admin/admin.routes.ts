import { Router, type RequestHandler } from 'express';
import { ApiError } from '../../http/api-error.js';
import { validate } from '../../http/validate.js';
import { createAccessControl } from '../auth/access-control.js';
import { unauthorized, type AuthService } from '../auth/auth.service.js';
import { emptyOrderQuery, orderListQuery, orderParams } from '../orders/orders.validation.js';
import { createAuctionRateLimit, type AuctionRateOptions } from '../auctions/auction-rate-limit.js';
import { adminUserQuery, accountStateInput } from './admin.validation.js';
import type { AdminService } from './admin.service.js';
export function adminRoutes(
  service: AdminService,
  auth?: AuthService,
  limits: AuctionRateOptions = {},
) {
  const router = Router(),
    access = auth ? createAccessControl(auth) : undefined;
  const rate = createAuctionRateLimit({ ipLimit: 240, accountLimit: 120, ...limits });
  const authenticate: RequestHandler =
    access?.authenticate ??
    (() => {
      throw unauthorized();
    });
  const admin: RequestHandler =
    access?.requireRoles('administrador') ??
    (() => {
      throw unauthorized();
    });
  router.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  router.use(rate.byIp, authenticate, admin, (req, res, next) => {
    rate.account(access!.principal(req).id, res);
    next();
  });
  router.get(
    '/dashboard',
    validate(emptyOrderQuery, (req) => req.query),
    async (req, res) => {
      res.json(await service.dashboard(access!.principal(req)));
    },
  );
  router.get(
    '/users',
    validate(adminUserQuery, (req) => req.query),
    async (req, res) => {
      res.json(await service.list(access!.principal(req), res.locals.validated));
    },
  );
  router.get(
    '/users/:id',
    validate(orderParams, (req) => req.params),
    validate(emptyOrderQuery, (req) => req.query),
    async (req, res) => {
      const result = await service.detail(access!.principal(req), String(req.params.id));
      res.setHeader('ETag', result.etag);
      res.json(result.body);
    },
  );
  router.get(
    '/users/:id/audit',
    validate(orderParams, (req) => req.params),
    validate(orderListQuery, (req) => req.query),
    async (req, res) => {
      res.json(
        await service.audit(access!.principal(req), String(req.params.id), res.locals.validated),
      );
    },
  );
  router.patch(
    '/users/:id/state',
    validate(orderParams, (req) => req.params),
    validate(emptyOrderQuery, (req) => req.query),
    (req, _res, next) => {
      if (!req.is('application/json'))
        throw new ApiError(415, 'CONTEUDO_NAO_SUPORTADO', 'Utiliza application/json.');
      next();
    },
    validate(accountStateInput, (req) => req.body),
    async (req, res) => {
      const values = req.headersDistinct['if-match'];
      if (values && values.length !== 1)
        throw new ApiError(
          400,
          'IF_MATCH_INVALIDO',
          'Envia um único ETag forte recebido do servidor.',
        );
      const result = await service.changeState(
        access!.principal(req),
        String(req.params.id),
        res.locals.validated,
        values?.[0],
      );
      res.setHeader('ETag', result.etag);
      res.json(result.body);
    },
  );
  return router;
}
