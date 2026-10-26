import { Router } from 'express';
import type { RequestHandler } from 'express';
import { validate } from '../../http/validate.js';
import { createAccessControl } from '../auth/access-control.js';
import type { AuthService } from '../auth/auth.service.js';
import { unauthorized } from '../auth/auth.service.js';
import type { CatalogService } from './catalog.service.js';
import {
  emptyCatalogQuery,
  ownCatalogQuery,
  productCreateSchema,
  productParams,
  productReplaceSchema,
  producerProductsQuery,
  publicCatalogQuery,
  publicProducerQuery,
} from './catalog.validation.js';
import { ApiError } from '../../http/api-error.js';

export function catalogRoutes(service: CatalogService, auth?: AuthService) {
  const router = Router();
  router.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  const access = auth ? createAccessControl(auth) : undefined;
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
  const json: RequestHandler = (req, _res, next) => {
    if (!req.is('application/json'))
      throw new ApiError(415, 'CONTEUDO_NAO_SUPORTADO', 'Utiliza application/json.');
    next();
  };
  router.get(
    '/products',
    validate(publicCatalogQuery, (req) => req.query),
    async (_req, res) => {
      res.json(await service.products(res.locals.validated));
    },
  );
  router.get(
    '/products/:id',
    validate(productParams, (req) => req.params),
    validate(emptyCatalogQuery, (req) => req.query),
    async (req, res) => {
      const item = await service.product(String(req.params.id).toLowerCase());
      res.json(item.dto);
    },
  );
  router.get(
    '/producers',
    validate(publicProducerQuery, (req) => req.query),
    async (_req, res) => res.json(await service.producers(res.locals.validated)),
  );
  router.get(
    '/producers/:id',
    validate(productParams, (req) => req.params),
    validate(producerProductsQuery, (req) => req.query),
    async (req, res) => {
      const id = String(req.params.id).toLowerCase();
      const profile = await service.producer(id);
      const query = res.locals.validated;
      res.json({ ...profile, produtos: await service.products({ ...query, produtor: id }) });
    },
  );
  router.get(
    '/me/products',
    authenticate,
    producer,
    validate(ownCatalogQuery, (req) => req.query),
    async (req, res) =>
      res.json(await service.ownProducts(access!.principal(req), res.locals.validated)),
  );
  router.get(
    '/me/products/:id',
    authenticate,
    producer,
    validate(productParams, (req) => req.params),
    validate(emptyCatalogQuery, (req) => req.query),
    async (req, res) => {
      const item = await service.ownProduct(
        access!.principal(req),
        String(req.params.id).toLowerCase(),
      );
      res.setHeader('ETag', item.etag);
      res.json(item);
    },
  );
  router.post(
    '/products',
    authenticate,
    producer,
    validate(emptyCatalogQuery, (req) => req.query),
    json,
    validate(productCreateSchema, (req) => req.body),
    async (req, res) => {
      const item = await service.create(access!.principal(req), res.locals.validated);
      res.setHeader('Location', '/api/products/' + item.id);
      res.setHeader('ETag', item.etag);
      res.status(201).json(item);
    },
  );
  router.put(
    '/products/:id',
    authenticate,
    producer,
    validate(productParams, (req) => req.params),
    validate(emptyCatalogQuery, (req) => req.query),
    json,
    validate(productReplaceSchema, (req) => req.body),
    async (req, res) => {
      const item = await service.replace(
        access!.principal(req),
        String(req.params.id).toLowerCase(),
        res.locals.validated,
        req.get('If-Match'),
      );
      res.setHeader('ETag', item.etag);
      res.json(item);
    },
  );
  router.delete(
    '/products/:id',
    authenticate,
    producer,
    validate(productParams, (req) => req.params),
    validate(emptyCatalogQuery, (req) => req.query),
    validate(emptyCatalogQuery, (req) => req.body ?? {}),
    async (req, res) => {
      await service.archive(
        access!.principal(req),
        String(req.params.id).toLowerCase(),
        req.get('If-Match'),
      );
      res.status(204).end();
    },
  );
  return router;
}
