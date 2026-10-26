import type { Request, RequestHandler } from 'express';
import { ApiError } from '../../http/api-error.js';
import type { UserRole } from '../users/user.model.js';
import type { AuthPrincipal, AuthService } from './auth.service.js';
import { unauthorized } from './auth.service.js';

/** Identidade ligada ao pedido pelo middleware, sem dados de autorização fornecidos pelo cliente. */
export function createAccessControl(service: Pick<AuthService, 'authenticate'>) {
  const principals = new WeakMap<Request, AuthPrincipal>();
  function principal(request: Request): AuthPrincipal {
    const value = principals.get(request);
    if (!value) throw unauthorized();
    return value;
  }
  const authenticate: RequestHandler = async (request, response, next) => {
    const header = request.headers.authorization;
    if (
      typeof header !== 'string' ||
      header.length > 2048 ||
      !/^Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/i.test(header)
    ) {
      response.setHeader('WWW-Authenticate', 'Bearer');
      throw unauthorized();
    }
    try {
      principals.set(request, await service.authenticate(header.slice(7)));
    } catch (error) {
      if (error instanceof ApiError && error.status === 401)
        response.setHeader('WWW-Authenticate', 'Bearer');
      throw error;
    }
    next();
  };
  function requireRoles(...roles: readonly UserRole[]): RequestHandler {
    if (!roles.length) throw new Error('Lista de capacidades autorizadas obrigatória.');
    return (request, _response, next) => {
      if (!roles.some((role) => principal(request).papeis.includes(role)))
        throw new ApiError(403, 'ACESSO_PROIBIDO', 'Não tens acesso a esta operação.');
      next();
    };
  }
  function requireOwnership(
    resolveOwner: (request: Request) => Promise<string | null>,
  ): RequestHandler {
    return async (request, _response, next) => {
      const user = principal(request);
      const owner = await resolveOwner(request);
      if (owner !== user.id)
        throw new ApiError(403, 'ACESSO_PROIBIDO', 'Não tens acesso a este recurso.');
      next();
    };
  }
  return { authenticate, requireRoles, requireOwnership, principal };
}
