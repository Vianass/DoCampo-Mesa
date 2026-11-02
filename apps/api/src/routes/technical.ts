import { createAuctionRateLimit } from '../modules/auctions/auction-rate-limit.js';
import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../http/validate.js';

export function technicalRoutes(readiness?: () => Promise<boolean>) {
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
  router.get(
    '/ready',
    createAuctionRateLimit({ ipLimit: 120 }).byIp,
    validate(z.strictObject({}), (request) => request.query),
    async (_request, response) => {
      let available = false;
      if (readiness) {
        let timeout: NodeJS.Timeout | undefined;
        try {
          available = await Promise.race([
            readiness(),
            new Promise<false>((resolve) => {
              timeout = setTimeout(() => resolve(false), 1500);
            }),
          ]);
        } catch {
          available = false;
        } finally {
          clearTimeout(timeout);
        }
      }
      response
        .setHeader('Cache-Control', 'no-store')
        .status(available ? 200 : 503)
        .json({ estado: available ? 'operacional' : 'indisponivel', ambito: 'api-mongodb' });
    },
  );
  return router;
}
