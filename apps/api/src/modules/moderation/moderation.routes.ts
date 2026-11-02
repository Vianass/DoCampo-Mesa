import { Router, type Request, type RequestHandler } from 'express';
import { validate } from '../../http/validate.js';
import { ApiError } from '../../http/api-error.js';
import { createAccessControl } from '../auth/access-control.js';
import { unauthorized, type AuthService, type AuthPrincipal } from '../auth/auth.service.js';
import { createAuctionRateLimit } from '../auctions/auction-rate-limit.js';
import { orderParams, orderListQuery, emptyOrderQuery } from '../orders/orders.validation.js';
import {
  reportInput,
  reportLookup,
  reportQuery,
  reportDecision,
  contentQuery,
  contentParams,
  contentDecision,
} from './moderation.validation.js';
import type { ModerationService } from './moderation.service.js';
const json: RequestHandler = (req, _res, next) => {
  if (!req.is('application/json'))
    throw new ApiError(415, 'CONTEUDO_NAO_SUPORTADO', 'Utiliza application/json.');
  next();
};
const tag = (req: Request) => {
  const v = req.headersDistinct['if-match'];
  if (v && v.length !== 1)
    throw new ApiError(400, 'IF_MATCH_INVALIDO', 'Envia um único ETag forte.');
  return v?.[0];
};
export function contentReportRoutes(service: ModerationService, auth?: AuthService) {
  const router = Router(),
    access = auth ? createAccessControl(auth) : undefined;
  const reads = createAuctionRateLimit({ ipLimit: 240, accountLimit: 120 });
  const writes = createAuctionRateLimit({ ipLimit: 120, accountLimit: 12 });
  const authenticate: RequestHandler =
    access?.authenticate ??
    (() => {
      throw unauthorized();
    });
  router.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  router.post(
    '/content-reports',
    writes.byIp,
    authenticate,
    (req, res, next) => {
      writes.account(access!.principal(req).id, res);
      next();
    },
    validate(emptyOrderQuery, (req) => req.query),
    json,
    validate(reportInput, (req) => req.body),
    async (req, res) => {
      const body = res.locals.validated;
      const result = await service.create(access!.principal(req), body);
      res
        .location('/api/me/content-reports?alvoTipo=' + body.alvoTipo + '&alvoId=' + body.alvoId)
        .status(201)
        .json(result);
    },
  );
  router.get(
    '/me/content-reports',
    reads.byIp,
    authenticate,
    (req, res, next) => {
      reads.account(access!.principal(req).id, res);
      next();
    },
    validate(reportLookup, (req) => req.query),
    async (req, res) => res.json(await service.own(access!.principal(req), res.locals.validated)),
  );
  return router;
}
/** Extensão do router administrativo existente: mesmas guardas e limite, sem área paralela. */
export function adminContentRoutes(
  service: ModerationService,
  principal: (req: Request) => AuthPrincipal,
) {
  const router = Router();
  router.get(
    '/content-reports',
    validate(reportQuery, (req) => req.query),
    async (req, res) => res.json(await service.list(principal(req), res.locals.validated)),
  );
  router.get(
    '/content-reports/:id',
    validate(orderParams, (req) => req.params),
    validate(emptyOrderQuery, (req) => req.query),
    async (req, res) => {
      const r = await service.detail(principal(req), String(req.params.id));
      res.setHeader('ETag', r.etag).json(r);
    },
  );
  router.patch(
    '/content-reports/:id/decision',
    validate(orderParams, (req) => req.params),
    validate(emptyOrderQuery, (req) => req.query),
    json,
    validate(reportDecision, (req) => req.body),
    async (req, res) => {
      const r = await service.decide(
        principal(req),
        String(req.params.id),
        res.locals.validated,
        tag(req),
      );
      res.setHeader('ETag', r.etag).json(r);
    },
  );
  router.get(
    '/content',
    validate(contentQuery, (req) => req.query),
    async (req, res) => res.json(await service.contents(principal(req), res.locals.validated)),
  );
  router.get(
    '/content/:tipo/:id',
    validate(contentParams, (req) => req.params),
    validate(emptyOrderQuery, (req) => req.query),
    async (req, res) => {
      const r = await service.content(
        principal(req),
        req.params.tipo as 'produto' | 'produtor',
        String(req.params.id),
      );
      res.setHeader('ETag', r.etag).json(r);
    },
  );
  router.get(
    '/content/:tipo/:id/history',
    validate(contentParams, (req) => req.params),
    validate(orderListQuery, (req) => req.query),
    async (req, res) =>
      res.json(
        await service.history(
          principal(req),
          req.params.tipo as 'produto' | 'produtor',
          String(req.params.id),
          res.locals.validated,
        ),
      ),
  );
  router.patch(
    '/content/:tipo/:id/moderation',
    validate(contentParams, (req) => req.params),
    validate(emptyOrderQuery, (req) => req.query),
    json,
    validate(contentDecision, (req) => req.body),
    async (req, res) => {
      const r = await service.moderate(
        principal(req),
        req.params.tipo as 'produto' | 'produtor',
        String(req.params.id),
        res.locals.validated,
        tag(req),
      );
      res.setHeader('ETag', r.etag).json(r);
    },
  );
  return router;
}
