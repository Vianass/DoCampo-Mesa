import { Router, type RequestHandler, type Request } from 'express';
import { z } from 'zod';
import { ApiError } from '../../http/api-error.js';
import { validate } from '../../http/validate.js';
import { createAccessControl } from '../auth/access-control.js';
import { unauthorized, type AuthService, type AuthPrincipal } from '../auth/auth.service.js';
import { createAuctionRateLimit } from '../auctions/auction-rate-limit.js';
import { orderParams, orderListQuery, emptyOrderQuery } from '../orders/orders.validation.js';
import {
  reviewAdminQuery,
  reviewCreateInput,
  reviewDecisionInput,
  reviewTargets,
} from './review.validation.js';
import type { ReviewsService } from './reviews.service.js';
const noStore: RequestHandler = (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
};
const json: RequestHandler = (req, _res, next) => {
  if (!req.is('application/json'))
    throw new ApiError(415, 'CONTEUDO_NAO_SUPORTADO', 'Utiliza application/json.');
  next();
};
export function reviewsRoutes(service: ReviewsService, auth?: AuthService) {
  const router = Router(),
    access = auth ? createAccessControl(auth) : undefined,
    rate = createAuctionRateLimit({ ipLimit: 240, accountLimit: 60 });
  const privateAccess: RequestHandler[] = [
    rate.byIp,
    noStore,
    access?.authenticate ??
      (() => {
        throw unauthorized();
      }),
    access?.requireRoles('comprador') ??
      (() => {
        throw unauthorized();
      }),
    (req, res, next) => {
      rate.account(access!.principal(req).id, res);
      next();
    },
  ];
  router.get(
    '/products/:id/reviews',
    rate.byIp,
    noStore,
    validate(orderParams, (req) => req.params),
    validate(orderListQuery, (req) => req.query),
    async (req, res) =>
      res.json(await service.publicProduct(String(req.params.id), res.locals.validated)),
  );
  router.get(
    '/producers/:id/reviews',
    rate.byIp,
    noStore,
    validate(orderParams, (req) => req.params),
    validate(
      orderListQuery.extend({ alvoTipo: z.enum(reviewTargets).default('produtor') }),
      (req) => req.query,
    ),
    async (req, res) => {
      const q = res.locals.validated;
      res.json(await service.publicProducer(String(req.params.id), q, q.alvoTipo));
    },
  );
  router.get(
    '/me/reviews',
    ...privateAccess,
    validate(orderListQuery, (req) => req.query),
    async (req, res) => res.json(await service.own(access!.principal(req), res.locals.validated)),
  );
  router.get(
    '/me/reviews/:id',
    ...privateAccess,
    validate(orderParams, (req) => req.params),
    validate(emptyOrderQuery, (req) => req.query),
    async (req, res) =>
      res.json(await service.ownDetail(access!.principal(req), String(req.params.id))),
  );
  router.get(
    '/me/review-eligibility',
    ...privateAccess,
    validate(orderListQuery, (req) => req.query),
    async (req, res) =>
      res.json(await service.eligibility(access!.principal(req), res.locals.validated)),
  );
  router.post(
    '/reviews',
    ...privateAccess,
    validate(emptyOrderQuery, (req) => req.query),
    json,
    validate(reviewCreateInput, (req) => req.body),
    async (req, res) => {
      const result = await service.create(access!.principal(req), res.locals.validated);
      res
        .location('/api/me/reviews/' + result.id)
        .status(201)
        .json(result);
    },
  );
  return router;
}
/** Montado dentro do router administrativo autenticado e limitado existente. */
export function adminReviewRoutes(
  service: ReviewsService,
  principal: (req: Request) => AuthPrincipal,
) {
  const router = Router();
  router.get(
    '/',
    validate(reviewAdminQuery, (req) => req.query),
    async (req, res) => res.json(await service.adminList(principal(req), res.locals.validated)),
  );
  router.get(
    '/:id',
    validate(orderParams, (req) => req.params),
    validate(emptyOrderQuery, (req) => req.query),
    async (req, res) => {
      const r = await service.adminDetail(principal(req), String(req.params.id));
      res.setHeader('ETag', r.etag).json(r.body);
    },
  );
  router.get(
    '/:id/history',
    validate(orderParams, (req) => req.params),
    validate(orderListQuery, (req) => req.query),
    async (req, res) =>
      res.json(await service.history(principal(req), String(req.params.id), res.locals.validated)),
  );
  router.patch(
    '/:id/moderation',
    validate(orderParams, (req) => req.params),
    validate(emptyOrderQuery, (req) => req.query),
    json,
    validate(reviewDecisionInput, (req) => req.body),
    async (req, res) => {
      const values = req.headersDistinct['if-match'];
      if (values && values.length !== 1)
        throw new ApiError(400, 'IF_MATCH_INVALIDO', 'Envia um único ETag forte.');
      const r = await service.moderate(
        principal(req),
        String(req.params.id),
        res.locals.validated,
        values?.[0],
      );
      res.setHeader('ETag', r.etag).json(r.body);
    },
  );
  return router;
}
