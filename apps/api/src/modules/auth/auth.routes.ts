import { Router } from 'express';
import { validate } from '../../http/validate.js';
import { ApiError } from '../../http/api-error.js';
import { createAccessControl } from './access-control.js';
import { createAuthRateLimit } from './auth-rate-limit.js';
import type { AuthRateLimitOptions } from './auth-rate-limit.js';
import type { AuthService } from './auth.service.js';
import { credentialsSchema, emptyQuerySchema, registrationSchema } from './auth.validation.js';

export function authRoutes(service: AuthService, rateOptions?: AuthRateLimitOptions) {
  const router = Router();
  const access = createAccessControl(service);
  const rate = createAuthRateLimit(rateOptions);
  router.use(validate(emptyQuerySchema, (request) => request.query));
  router.post(['/register', '/login'], rate.byIp, (request, _response, next) => {
    if (!request.is('application/json'))
      throw new ApiError(415, 'CONTEUDO_NAO_SUPORTADO', 'Utiliza application/json.');
    next();
  });
  router.post(
    '/register',
    validate(registrationSchema, (request) => request.body),
    async (_request, response) => {
      response.status(202).json(await service.register(response.locals.validated));
    },
  );
  router.post(
    '/login',
    validate(credentialsSchema, (request) => request.body),
    rate.byAccount,
    async (_request, response) => {
      response.json(await service.login(response.locals.validated));
    },
  );
  router.get('/me', access.authenticate, (request, response) => {
    response.json(access.principal(request));
  });
  router.post(
    '/logout',
    access.authenticate,
    validate(emptyQuerySchema, (request) => request.body ?? {}),
    (_request, response) => {
      response.json({
        mensagem: 'Termina a sessão no cliente. O token continua válido até expirar.',
        revogado: false,
      });
    },
  );
  return router;
}
