import type { RequestHandler } from 'express';
import { isIP } from 'node:net';
import type { AuthConfiguration } from '../config/auth-environment.js';
import { ApiError } from './api-error.js';

export type HttpSecurityConfiguration = Pick<
  AuthConfiguration,
  'production' | 'allowedOrigins' | 'trustedProxies'
> & { trustedProxyHops?: 1 };
export function httpSecurity(settings: HttpSecurityConfiguration): RequestHandler {
  return (request, response, next) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('X-Frame-Options', 'DENY');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
    if (request.path.startsWith('/api/auth/')) response.setHeader('Cache-Control', 'no-store');
    if (settings.production) {
      const forwarded =
        String(request.headers['x-forwarded-for'] ?? '')
          .split(',')
          .at(-1)
          ?.trim() ?? '';
      if (
        !request.secure ||
        (settings.trustedProxyHops === 1 &&
          (request.headers['x-forwarded-proto'] !== 'https' || !isIP(forwarded)))
      )
        throw new ApiError(400, 'HTTPS_OBRIGATORIO', 'Esta ligação exige HTTPS.');
      response.setHeader('Strict-Transport-Security', 'max-age=31536000');
    }
    const origin = request.headers.origin;
    if (origin !== undefined) {
      response.vary('Origin');
      const ownOrigin = `${request.protocol}://${request.get('host')}`;
      if (!settings.allowedOrigins.includes(origin) && origin !== ownOrigin)
        throw new ApiError(403, 'ORIGEM_NAO_PERMITIDA', 'Origem não permitida.');
      response.setHeader('Access-Control-Allow-Origin', origin);
      response.setHeader('Access-Control-Expose-Headers', 'ETag, Location');
      if (request.method === 'OPTIONS') {
        const method = request.headers['access-control-request-method'];
        const headers = String(request.headers['access-control-request-headers'] ?? '')
          .toLowerCase()
          .split(',')
          .map((v) => v.trim())
          .filter(Boolean);
        if (
          !['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(String(method)) ||
          headers.some(
            (h) => !['authorization', 'content-type', 'if-match', 'idempotency-key'].includes(h),
          )
        )
          throw new ApiError(403, 'ORIGEM_NAO_PERMITIDA', 'Pedido de origem não permitido.');
        response.vary('Access-Control-Request-Method');
        response.vary('Access-Control-Request-Headers');
        response.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE');
        response.setHeader(
          'Access-Control-Allow-Headers',
          'Authorization, Content-Type, If-Match, Idempotency-Key',
        );
        response.status(204).end();
        return;
      }
    }
    next();
  };
}
