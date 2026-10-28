import { Router, type RequestHandler } from 'express';
import { ApiError } from '../../http/api-error.js';
import { validate } from '../../http/validate.js';
import { createAccessControl } from '../auth/access-control.js';
import { unauthorized, type AuthService } from '../auth/auth.service.js';
import { emptyOrderQuery, orderParams } from '../orders/orders.validation.js';
import type { ProducerApplicationService } from './producer-application.service.js';
import {
  applicationInput,
  applicationListQuery,
  rejectionInput,
} from './producer-application.validation.js';

export function producerApplicationRoutes(service: ProducerApplicationService, auth?: AuthService) {
  const router = Router(),
    access = auth ? createAccessControl(auth) : undefined;
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
  const json: RequestHandler = (req, _res, next) => {
    if (!req.is('application/json'))
      throw new ApiError(415, 'CONTEUDO_NAO_SUPORTADO', 'Utiliza application/json.');
    next();
  };
  const self = '/me/producer-application',
    managed = '/admin/producer-applications';
  router.use([self, managed], (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  router.get(
    self,
    authenticate,
    validate(emptyOrderQuery, (req) => req.query),
    async (req, res) => {
      const result = await service.self(access!.principal(req));
      res.setHeader('ETag', result.etag);
      res.json(result.body);
    },
  );
  router.post(
    self,
    authenticate,
    validate(emptyOrderQuery, (req) => req.query),
    json,
    validate(applicationInput, (req) => req.body),
    async (req, res) => {
      const result = await service.submit(access!.principal(req), res.locals.validated);
      res.setHeader('ETag', result.etag);
      res.setHeader('Location', '/api' + self);
      res.status(201).json(result.body);
    },
  );
  router.get(
    managed,
    authenticate,
    admin,
    validate(applicationListQuery, (req) => req.query),
    async (req, res) => {
      res.json(await service.list(access!.principal(req), res.locals.validated));
    },
  );
  router.get(
    managed + '/:id',
    authenticate,
    admin,
    validate(orderParams, (req) => req.params),
    validate(emptyOrderQuery, (req) => req.query),
    async (req, res) => {
      const result = await service.detail(access!.principal(req), String(req.params.id));
      res.setHeader('ETag', result.etag);
      res.json(result.body);
    },
  );
  for (const [action, outcome, schema] of [
    ['approve', 'aprovado', emptyOrderQuery],
    ['reject', 'rejeitado', rejectionInput],
  ] as const) {
    router.post(
      managed + '/:id/' + action,
      authenticate,
      admin,
      validate(orderParams, (req) => req.params),
      validate(emptyOrderQuery, (req) => req.query),
      json,
      validate(schema, (req) => req.body),
      async (req, res) => {
        const headers = req.headersDistinct['if-match'];
        if (headers && headers.length !== 1)
          throw new ApiError(
            400,
            'IF_MATCH_INVALIDO',
            'Envia um único ETag forte recebido do servidor.',
          );
        const input = res.locals.validated as { justificacao?: string };
        const result = await service.decide(
          access!.principal(req),
          String(req.params.id),
          outcome,
          headers?.[0],
          input.justificacao,
        );
        res.setHeader('ETag', result.etag);
        res.json(result.body);
      },
    );
  }
  return router;
}
