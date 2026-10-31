import { createAuctionRateLimit } from '../auctions/auction-rate-limit.js';
import { confirmReceiptInput, type OrderReceiptService } from './order-receipt.service.js';
import { Router, type RequestHandler } from 'express';
import type { AuthService } from '../auth/auth.service.js';
import { unauthorized } from '../auth/auth.service.js';
import { createAccessControl } from '../auth/access-control.js';
import { validate } from '../../http/validate.js';
import { ApiError } from '../../http/api-error.js';
import type { OrdersService } from './orders.service.js';
import { emptyOrderQuery, orderListQuery, orderParams } from './orders.validation.js';
import {
  checkoutAttemptParams,
  checkoutAttemptSchema,
  prepareCheckoutSchema,
} from './checkout-preparation.service.js';
import type { CheckoutPreparationService } from './checkout-preparation.service.js';

export function ordersRoutes(
  service: OrdersService,
  auth?: AuthService,
  preparation?: CheckoutPreparationService,
  receipt?: OrderReceiptService,
) {
  const router = Router(),
    receiptRate = createAuctionRateLimit({ ipLimit: 240, accountLimit: 60 });
  router.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  const access = auth ? createAccessControl(auth) : undefined;
  const unavailable: RequestHandler = () => {
    throw unauthorized();
  };
  router.use(access?.authenticate ?? unavailable, access?.requireRoles('comprador') ?? unavailable);
  if (preparation) {
    const json: RequestHandler = (req, _res, next) => {
      if (!req.is('application/json'))
        throw new ApiError(415, 'CONTEUDO_NAO_SUPORTADO', 'Utiliza application/json.');
      next();
    };
    router.post(
      '/prepare',
      validate(emptyOrderQuery, (req) => req.query),
      json,
      validate(prepareCheckoutSchema, (req) => req.body),
      async (req, res) => {
        res.json(await preparation.metadata(access!.principal(req), res.locals.validated));
      },
    );
    router.post(
      '/attempts',
      validate(emptyOrderQuery, (req) => req.query),
      json,
      validate(checkoutAttemptSchema, (req) => req.body),
      async (req, res) => {
        const values = req.headersDistinct['idempotency-key'];
        res
          .status(200)
          .json(
            await preparation.checkpoint(
              access!.principal(req),
              res.locals.validated.referencia,
              values?.length === 1 ? values[0] : undefined,
              res.locals.validated.pedido,
            ),
          );
      },
    );
    router.get(
      '/attempts/:referencia',
      validate(checkoutAttemptParams, (req) => req.params),
      validate(emptyOrderQuery, (req) => req.query),
      async (req, res) => {
        res.json(await preparation.recover(access!.principal(req), String(req.params.referencia)));
      },
    );
  }
  router.post(
    '/',
    validate(emptyOrderQuery, (req) => req.query),
    async (req, res) => {
      if (!req.is('application/json'))
        throw new ApiError(415, 'CONTEUDO_NAO_SUPORTADO', 'Utiliza application/json.');
      const values = req.headersDistinct['idempotency-key'];
      // Rejeitar headers duplicados: não interpretar a junção automática como uma nova chave lógica.
      const key = values?.length === 1 ? values[0] : undefined;
      const result = await service.checkout(access!.principal(req), key, req.body);
      if (result.location) res.setHeader('Location', result.location);
      res.status(result.status).json(result.body);
    },
  );
  router.get(
    '/',
    validate(orderListQuery, (req) => req.query),
    async (req, res) => {
      res.json(await service.list(access!.principal(req), res.locals.validated));
    },
  );
  if (receipt)
    router.patch(
      '/:id/receipt',
      receiptRate.byIp,
      (req, res, next) => {
        receiptRate.account(access!.principal(req).id, res);
        next();
      },
      validate(orderParams, (req) => req.params),
      validate(emptyOrderQuery, (req) => req.query),
      (req, _res, next) => {
        if (!req.is('application/json'))
          throw new ApiError(415, 'CONTEUDO_NAO_SUPORTADO', 'Utiliza application/json.');
        next();
      },
      validate(confirmReceiptInput, (req) => req.body),
      async (req, res) => {
        const values = req.headersDistinct['if-match'];
        if (values && values.length !== 1)
          throw new ApiError(400, 'IF_MATCH_INVALIDO', 'Envia um único ETag forte.');
        const result = await receipt.confirm(
          access!.principal(req),
          String(req.params.id).toLowerCase(),
          values?.[0],
        );
        res.setHeader('ETag', result.etag).json(result.body);
      },
    );
  router.get(
    '/:id',
    validate(orderParams, (req) => req.params),
    validate(emptyOrderQuery, (req) => req.query),
    async (req, res) => {
      const principal = access!.principal(req);
      const result = await service.detail(principal, String(req.params.id).toLowerCase());
      if (receipt) res.setHeader('ETag', receipt.etag(principal, result));
      res.json(result);
    },
  );
  return router;
}
