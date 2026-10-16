import express from 'express';
import { ApiError } from './http/api-error.js';
import { errorHandler } from './http/error-handler.js';
import { technicalRoutes } from './routes/technical.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('query parser', 'simple');
  app.use(express.json({ limit: '100kb' }));
  app.use('/api', technicalRoutes());
  app.use((_request, _response, next) => {
    next(new ApiError(404, 'ROTA_NAO_ENCONTRADA', 'O recurso pedido não está disponível.'));
  });
  app.use(errorHandler);
  return app;
}
