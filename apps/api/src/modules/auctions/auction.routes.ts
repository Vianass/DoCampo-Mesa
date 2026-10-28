import { Router, type RequestHandler, type Request } from 'express';
import { ApiError } from '../../http/api-error.js';
import { validate } from '../../http/validate.js';
import { createAccessControl } from '../auth/access-control.js';
import { unauthorized } from '../auth/auth.service.js';
import type { AuthService } from '../auth/auth.service.js';
import { orderParams, emptyOrderQuery, orderListQuery } from '../orders/orders.validation.js';
import { auctionQuery } from './auction.validation.js';
import { createAuctionRateLimit, type AuctionRateOptions } from './auction-rate-limit.js';
import type { AuctionService } from './auction.service.js';
function header(req: Request, name: 'if-match' | 'idempotency-key') {
  const values = req.headersDistinct[name];
  if (values && values.length !== 1)
    throw new ApiError(400, 'CABECALHO_INVALIDO', 'Envia um único valor para o cabeçalho.');
  return values?.[0];
}
export function auctionRoutes(
  service: AuctionService,
  auth?: AuthService,
  limits: AuctionRateOptions = {},
) {
  const router = Router(),
    access = auth ? createAccessControl(auth) : undefined,
    rate = createAuctionRateLimit(limits);
  const authenticate: RequestHandler =
    access?.authenticate ??
    (() => {
      throw unauthorized();
    });
  const producer: RequestHandler =
    access?.requireRoles('produtor') ??
    (() => {
      throw unauthorized();
    });
  const buyer: RequestHandler =
    access?.requireRoles('comprador') ??
    (() => {
      throw unauthorized();
    });
  const account: RequestHandler = (req, res, next) => {
    rate.account(access!.principal(req).id, res);
    next();
  };
  const json: RequestHandler = (req, _res, next) => {
    if (!req.is('application/json'))
      throw new ApiError(415, 'CONTEUDO_NAO_SUPORTADO', 'Utiliza application/json.');
    next();
  };
  router.use(['/auctions', '/me/producer/auctions'], (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  router.use(['/auctions', '/me/producer/auctions'], rate.byIp);
  router.get(
    '/auctions',
    validate(auctionQuery, (req) => req.query),
    async (_req, res) => {
      res.json(await service.list(res.locals.validated));
    },
  );
  router.get(
    '/me/producer/auctions',
    authenticate,
    producer,
    validate(auctionQuery, (req) => req.query),
    async (req, res) => {
      res.json(await service.list(res.locals.validated, access!.principal(req)));
    },
  );
  router.post(
    '/auctions',
    authenticate,
    producer,
    account,
    validate(emptyOrderQuery, (req) => req.query),
    json,
    async (req, res) => {
      const result = await service.create(
        access!.principal(req),
        req.body,
        header(req, 'idempotency-key'),
      );
      res.setHeader('ETag', result.etag);
      res.setHeader('Location', '/api/auctions/' + result.body.id);
      res.status(result.status).json(result.body);
    },
  );
  router.get(
    '/auctions/:id',
    authenticate,
    validate(orderParams, (req) => req.params),
    validate(emptyOrderQuery, (req) => req.query),
    async (req, res) => {
      const result = await service.detail(access!.principal(req), String(req.params.id));
      res.setHeader('ETag', result.etag);
      res.json(result.body);
    },
  );
  router.put(
    '/auctions/:id',
    authenticate,
    producer,
    account,
    validate(orderParams, (req) => req.params),
    validate(emptyOrderQuery, (req) => req.query),
    json,
    async (req, res) => {
      const result = await service.edit(
        access!.principal(req),
        String(req.params.id),
        req.body,
        header(req, 'if-match'),
      );
      res.setHeader('ETag', result.etag);
      res.json(result.body);
    },
  );
  router.post(
    '/auctions/:id/cancel',
    authenticate,
    producer,
    account,
    validate(orderParams, (req) => req.params),
    validate(emptyOrderQuery, (req) => req.query),
    json,
    validate(emptyOrderQuery, (req) => req.body),
    async (req, res) => {
      const result = await service.cancel(
        access!.principal(req),
        String(req.params.id),
        header(req, 'if-match'),
      );
      res.setHeader('ETag', result.etag);
      res.json(result.body);
    },
  );
  router.post(
    '/auctions/:id/bids',
    authenticate,
    buyer,
    account,
    validate(orderParams, (req) => req.params),
    validate(emptyOrderQuery, (req) => req.query),
    json,
    async (req, res) => {
      const result = await service.bid(
        access!.principal(req),
        String(req.params.id),
        req.body,
        header(req, 'idempotency-key'),
      );
      res.status(result.status).json(result.body);
    },
  );
  router.get(
    '/auctions/:id/bids',
    authenticate,
    validate(orderParams, (req) => req.params),
    validate(orderListQuery, (req) => req.query),
    async (req, res) => {
      res.json(
        await service.history(access!.principal(req), String(req.params.id), res.locals.validated),
      );
    },
  );
  return router;
}
