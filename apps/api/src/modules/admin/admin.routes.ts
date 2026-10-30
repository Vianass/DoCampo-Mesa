import type { AdminAuctionsService } from '../admin-auctions/admin-auctions.service.js';
import type { ReviewsService } from '../reviews/reviews.service.js';
import { adminReviewRoutes } from '../reviews/reviews.routes.js';
import { adminAuctionQuery } from '../admin-auctions/admin-auctions.validation.js';
import type { AdminOrdersService } from '../admin-orders/admin-orders.service.js';
import {
  adminOrderQuery,
  adminOrderHistoryQuery,
} from '../admin-orders/admin-orders.validation.js';
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
  orders?: AdminOrdersService,
  auctions?: AdminAuctionsService,
  reviews?: ReviewsService,
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
  if (reviews)
    router.use(
      '/reviews',
      adminReviewRoutes(reviews, (req) => {
        if (!access) throw unauthorized();
        return access.principal(req);
      }),
    );
  if (auctions) {
    router.get(
      '/auctions',
      validate(adminAuctionQuery, (req) => req.query),
      async (req, res) =>
        res.json(await auctions.list(access!.principal(req), res.locals.validated)),
    );
    router.get(
      '/auctions/:id',
      validate(orderParams, (req) => req.params),
      validate(emptyOrderQuery, (req) => req.query),
      async (req, res) =>
        res.json(await auctions.detail(access!.principal(req), String(req.params.id))),
    );
    router.get(
      '/auctions/:id/bids',
      validate(orderParams, (req) => req.params),
      validate(orderListQuery, (req) => req.query),
      async (req, res) =>
        res.json(
          await auctions.history(
            access!.principal(req),
            String(req.params.id),
            res.locals.validated,
          ),
        ),
    );
  }
  if (orders) {
    router.get(
      '/orders',
      validate(adminOrderQuery, (req) => req.query),
      async (req, res) => {
        res.json(await orders.list(access!.principal(req), res.locals.validated));
      },
    );
    router.get(
      '/orders/:id',
      validate(orderParams, (req) => req.params),
      validate(emptyOrderQuery, (req) => req.query),
      async (req, res) => {
        res.json(await orders.detail(access!.principal(req), String(req.params.id)));
      },
    );
    router.get(
      '/orders/:id/history',
      validate(orderParams, (req) => req.params),
      validate(adminOrderHistoryQuery, (req) => req.query),
      async (req, res) => {
        res.json(
          await orders.history(access!.principal(req), String(req.params.id), res.locals.validated),
        );
      },
    );
  }
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
