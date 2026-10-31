import { Router, raw } from 'express';
import { z } from 'zod';
import { createAccessControl } from '../auth/access-control.js';
import { unauthorized, type AuthService } from '../auth/auth.service.js';
import { productParams } from '../catalog/catalog.validation.js';
import { validate } from '../../http/validate.js';
import { ApiError } from '../../http/api-error.js';
import { createAuctionRateLimit } from '../auctions/auction-rate-limit.js';
import type { ImageService } from './image.service.js';
import { maximumImageBytes } from './image.validation.js';
export function imageRoutes(service: ImageService, auth?: AuthService) {
  const router = Router(),
    access = auth ? createAccessControl(auth) : undefined,
    rate = createAuctionRateLimit({ ipLimit: 120, accountLimit: 30 });
  router.get(
    '/media/:id',
    validate(
      z.strictObject({ id: z.string().regex(/^[a-f0-9-]{36}\.webp$/) }),
      (req) => req.params,
    ),
    async (req, res) => {
      const token = req.headers.authorization;
      const principal = token
        ? await auth?.authenticate(/^Bearer /i.test(token) ? token.slice(7) : '')
        : undefined;
      const bytes = await service.read(String(req.params.id), principal);
      res.setHeader('Cache-Control', 'no-store');
      res.type('image/webp').send(bytes);
    },
  );
  const authorize = [
    rate.byIp,
    access?.authenticate ??
      (() => {
        throw unauthorized();
      }),
    access?.requireRoles('produtor') ??
      (() => {
        throw unauthorized();
      }),
  ];
  for (const kind of ['product', 'profile'] as const)
    router.post(
      kind === 'product' ? '/me/products/:id/images' : '/me/producer/image',
      ...authorize,
      (req, res, next) => {
        rate.account(access!.principal(req).id, res);
        res.setHeader('Cache-Control', 'no-store');
        next();
      },
      ...(kind === 'product' ? [validate(productParams, (req) => req.params)] : []),
      validate(z.strictObject({ substituir: z.enum(['0', '1']).optional() }), (req) => req.query),
      raw({
        type: ['image/jpeg', 'image/png', 'image/webp'],
        limit: maximumImageBytes,
        inflate: false,
      }),
      async (req, res) => {
        const tags = req.headersDistinct['if-match'];
        if (tags && tags.length !== 1)
          throw new ApiError(400, 'IF_MATCH_INVALIDO', 'Envia um único ETag forte.');
        const r =
          kind === 'product'
            ? await service.product(
                access!.principal(req),
                String(req.params.id),
                req.body,
                String(req.headers['content-type'] ?? '').split(';')[0]!,
                tags?.[0],
                res.locals.validated.substituir === undefined
                  ? undefined
                  : Number(res.locals.validated.substituir),
              )
            : await service.profile(
                access!.principal(req),
                req.body,
                String(req.headers['content-type'] ?? '').split(';')[0]!,
                tags?.[0],
              );
        res.setHeader('ETag', r.etag).json(r);
      },
    );
  return router;
}
