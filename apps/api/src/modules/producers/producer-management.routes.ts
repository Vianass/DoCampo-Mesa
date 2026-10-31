import { Router } from 'express';
import { createAccessControl } from '../auth/access-control.js';
import { unauthorized, type AuthService } from '../auth/auth.service.js';
import { validate } from '../../http/validate.js';
import { ApiError } from '../../http/api-error.js';
import { emptyCatalogQuery } from '../catalog/catalog.validation.js';
import { createAuctionRateLimit } from '../auctions/auction-rate-limit.js';
import { profileInput } from './producer-management.validation.js';
import type { ProducerManagementService } from './producer-management.service.js';
export function producerManagementRoutes(service: ProducerManagementService, auth?: AuthService) {
  const router = Router(),
    access = auth ? createAccessControl(auth) : undefined,
    rate = createAuctionRateLimit({ ipLimit: 240, accountLimit: 120 });
  router.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  router.use(
    rate.byIp,
    access?.authenticate ??
      (() => {
        throw unauthorized();
      }),
    access?.requireRoles('produtor') ??
      (() => {
        throw unauthorized();
      }),
  );
  router.use((req, res, next) => {
    rate.account(access!.principal(req).id, res);
    next();
  });
  router.get(
    '/indicators',
    validate(emptyCatalogQuery, (req) => req.query),
    async (req, res) => res.json(await service.indicators(access!.principal(req))),
  );
  router.get(
    '/',
    validate(emptyCatalogQuery, (req) => req.query),
    async (req, res) => {
      const r = await service.detail(access!.principal(req));
      res.setHeader('ETag', r.etag).json(r);
    },
  );
  router.put(
    '/',
    validate(emptyCatalogQuery, (req) => req.query),
    (req, _res, next) => {
      if (!req.is('application/json'))
        throw new ApiError(415, 'CONTEUDO_NAO_SUPORTADO', 'Utiliza application/json.');
      next();
    },
    validate(profileInput, (req) => req.body),
    async (req, res) => {
      const tags = req.headersDistinct['if-match'];
      if (tags && tags.length !== 1)
        throw new ApiError(400, 'IF_MATCH_INVALIDO', 'Envia um único ETag forte.');
      const r = await service.replace(access!.principal(req), res.locals.validated, tags?.[0]);
      res.setHeader('ETag', r.etag).json(r);
    },
  );
  return router;
}
