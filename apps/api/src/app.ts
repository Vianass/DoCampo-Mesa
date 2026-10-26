import express from 'express';
import { ApiError } from './http/api-error.js';
import { errorHandler } from './http/error-handler.js';
import { technicalRoutes } from './routes/technical.js';
import { httpSecurity } from './http/security.js';
import type { HttpSecurityConfiguration } from './http/security.js';
import { authRoutes } from './modules/auth/auth.routes.js';
import type { AuthService } from './modules/auth/auth.service.js';
import type { AuthRateLimitOptions } from './modules/auth/auth-rate-limit.js';
import type { CatalogService } from './modules/catalog/catalog.service.js';
import { catalogRoutes } from './modules/catalog/catalog.routes.js';

export function createApp(
  options: {
    auth?: AuthService;
    catalog?: CatalogService;
    security?: HttpSecurityConfiguration;
    rateLimit?: AuthRateLimitOptions;
  } = {},
) {
  const app = express();
  app.disable('x-powered-by');
  app.set('query parser', 'simple');
  const security = options.security ?? {
    production: false,
    allowedOrigins: [],
    trustedProxies: [],
  };
  app.set('trust proxy', security.trustedProxies.length ? [...security.trustedProxies] : false);
  app.use(httpSecurity(security));
  app.use(express.json({ limit: '100kb', inflate: false }));
  if (options.auth) app.use('/api/auth', authRoutes(options.auth, options.rateLimit));
  if (options.catalog) app.use('/api', catalogRoutes(options.catalog, options.auth));
  app.use('/api', technicalRoutes());
  app.use((_request, _response, next) => {
    next(new ApiError(404, 'ROTA_NAO_ENCONTRADA', 'O recurso pedido não está disponível.'));
  });
  app.use(errorHandler);
  return app;
}
