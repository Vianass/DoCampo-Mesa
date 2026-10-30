import type { AdminAuctionsService } from './modules/admin-auctions/admin-auctions.service.js';
import type { AdminOrdersService } from './modules/admin-orders/admin-orders.service.js';
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
import { ordersRoutes } from './modules/orders/orders.routes.js';
import type { OrdersService } from './modules/orders/orders.service.js';
import type { CheckoutPreparationService } from './modules/orders/checkout-preparation.service.js';
import { producerOrdersRoutes } from './modules/orders/producer-orders.routes.js';
import type { ProducerOrdersService } from './modules/orders/producer-orders.service.js';
import { auctionRoutes } from './modules/auctions/auction.routes.js';
import type { AuctionService } from './modules/auctions/auction.service.js';
import type { AuctionRateOptions } from './modules/auctions/auction-rate-limit.js';
import { producerApplicationRoutes } from './modules/producer-applications/producer-application.routes.js';
import type { ProducerApplicationService } from './modules/producer-applications/producer-application.service.js';

import { adminRoutes } from './modules/admin/admin.routes.js';
import type { AdminService } from './modules/admin/admin.service.js';

export function createApp(
  options: {
    auth?: AuthService;
    catalog?: CatalogService;
    orders?: OrdersService;
    preparation?: CheckoutPreparationService;
    producerOrders?: ProducerOrdersService;
    auctions?: AuctionService;
    producerApplications?: ProducerApplicationService;
    auctionLimits?: AuctionRateOptions;
    admin?: AdminService;
    adminOrders?: AdminOrdersService;
    adminAuctions?: AdminAuctionsService;
    adminLimits?: AuctionRateOptions;
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
  if (options.orders)
    app.use('/api/orders', ordersRoutes(options.orders, options.auth, options.preparation));
  if (options.producerOrders)
    app.use('/api/me/producer/orders', producerOrdersRoutes(options.producerOrders, options.auth));
  if (options.auctions)
    app.use('/api', auctionRoutes(options.auctions, options.auth, options.auctionLimits));
  if (options.producerApplications)
    app.use('/api', producerApplicationRoutes(options.producerApplications, options.auth));
  if (options.admin)
    app.use(
      '/api/admin',
      adminRoutes(
        options.admin,
        options.auth,
        options.adminLimits,
        options.adminOrders,
        options.adminAuctions,
      ),
    );
  app.use('/api', technicalRoutes());
  app.use((_request, _response, next) => {
    next(new ApiError(404, 'ROTA_NAO_ENCONTRADA', 'O recurso pedido não está disponível.'));
  });
  app.use(errorHandler);
  return app;
}
