import { apiRouteInventory, mountRoutes } from './documentation/route-inventory.js';
import { documentationRoutes } from './documentation/docs.routes.js';
import { academicOrdersRoutes } from './modules/orders/academic-orders.routes.js';
import { contentReportRoutes } from './modules/moderation/moderation.routes.js';
import type { ModerationService } from './modules/moderation/moderation.service.js';
import type { OrderReceiptService } from './modules/orders/order-receipt.service.js';
import type { AdminAuctionsService } from './modules/admin-auctions/admin-auctions.service.js';
import type { ReviewsService } from './modules/reviews/reviews.service.js';
import { reviewsRoutes } from './modules/reviews/reviews.routes.js';
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
import { producerManagementRoutes } from './modules/producers/producer-management.routes.js';
import type { ProducerManagementService } from './modules/producers/producer-management.service.js';
import { imageRoutes } from './modules/images/image.routes.js';
import type { ImageService } from './modules/images/image.service.js';

import { adminRoutes } from './modules/admin/admin.routes.js';
import type { AdminService } from './modules/admin/admin.service.js';

export function createApp(
  options: {
    auth?: AuthService;
    catalog?: CatalogService;
    orders?: OrdersService;
    receipt?: OrderReceiptService;
    preparation?: CheckoutPreparationService;
    producerOrders?: ProducerOrdersService;
    auctions?: AuctionService;
    producerApplications?: ProducerApplicationService;
    producerManagement?: ProducerManagementService;
    images?: ImageService;
    auctionLimits?: AuctionRateOptions;
    admin?: AdminService;
    adminOrders?: AdminOrdersService;
    adminAuctions?: AdminAuctionsService;
    reviews?: ReviewsService;
    moderation?: ModerationService;
    adminLimits?: AuctionRateOptions;
    readiness?: () => Promise<boolean>;
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
  if (options.auth) mountRoutes(app, '/api/auth', authRoutes(options.auth, options.rateLimit));
  if (options.reviews) mountRoutes(app, '/api', reviewsRoutes(options.reviews, options.auth));
  if (options.moderation)
    mountRoutes(app, '/api', contentReportRoutes(options.moderation, options.auth));
  if (options.catalog) mountRoutes(app, '/api', catalogRoutes(options.catalog, options.auth));
  if (options.producerManagement)
    mountRoutes(
      app,
      '/api/me/producer',
      producerManagementRoutes(options.producerManagement, options.auth),
    );
  if (options.images) mountRoutes(app, '/api', imageRoutes(options.images, options.auth));
  if (options.producerOrders && options.receipt)
    mountRoutes(
      app,
      '/api/orders',
      academicOrdersRoutes(options.producerOrders, options.receipt, options.auth),
    );
  if (options.orders)
    mountRoutes(
      app,
      '/api/orders',
      ordersRoutes(options.orders, options.auth, options.preparation, options.receipt),
    );
  if (options.producerOrders)
    mountRoutes(
      app,
      '/api/me/producer/orders',
      producerOrdersRoutes(options.producerOrders, options.auth),
    );
  if (options.auctions)
    mountRoutes(app, '/api', auctionRoutes(options.auctions, options.auth, options.auctionLimits));
  if (options.producerApplications)
    mountRoutes(app, '/api', producerApplicationRoutes(options.producerApplications, options.auth));
  if (options.admin)
    mountRoutes(
      app,
      '/api/admin',
      adminRoutes(
        options.admin,
        options.auth,
        options.adminLimits,
        options.adminOrders,
        options.adminAuctions,
        options.reviews,
        options.moderation,
      ),
    );
  mountRoutes(app, '/api', technicalRoutes(options.readiness));
  const inventory = apiRouteInventory(app);
  app.locals.apiRoutes = inventory;
  mountRoutes(app, '/api-docs', documentationRoutes(inventory));
  app.use((_request, _response, next) => {
    next(new ApiError(404, 'ROTA_NAO_ENCONTRADA', 'O recurso pedido não está disponível.'));
  });
  app.use(errorHandler);
  return app;
}
