import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../http/validate.js';

export function technicalRoutes() {
  const router = Router();
  router.get(
    '/health',
    validate(z.strictObject({}), (request) => request.query),
    (_request, response) => {
      response
        .set('Cache-Control', 'no-store')
        .json({ estado: 'operacional', ambito: 'processo-http' });
    },
  );
  return router;
}
