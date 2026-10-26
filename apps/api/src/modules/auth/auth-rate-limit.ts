import { createHmac, randomBytes } from 'node:crypto';
import type { RequestHandler } from 'express';
import { ApiError } from '../../http/api-error.js';

export interface AuthRateLimitOptions {
  readonly ipLimit?: number;
  readonly accountLimit?: number;
  readonly windowMs?: number;
  readonly maxEntries?: number;
  readonly now?: () => number;
}

/** Limite local ao processo, memória limitada e sem emails/passwords/tokens em logs. */
export function createAuthRateLimit(options: AuthRateLimitOptions = {}) {
  const ipLimit = options.ipLimit ?? 30;
  const accountLimit = options.accountLimit ?? 10;
  const windowMs = options.windowMs ?? 15 * 60_000;
  const maximum = options.maxEntries ?? 10_000;
  for (const value of [ipLimit, accountLimit, windowMs, maximum])
    if (!Number.isSafeInteger(value) || value < 1)
      throw new Error('Limite de autenticação inválido.');
  const now = options.now ?? Date.now;
  const secret = randomBytes(32);
  const entries = new Map<string, { count: number; until: number }>();
  function consume(key: string, limit: number, response: Parameters<RequestHandler>[1]) {
    const currentTime = now();
    for (const [entryKey, value] of entries)
      if (value.until <= currentTime) entries.delete(entryKey);
    let entry = entries.get(key);
    if (!entry) {
      if (entries.size >= maximum) {
        response.setHeader('Retry-After', Math.ceil(windowMs / 1000));
        throw new ApiError(
          429,
          'TENTATIVAS_EXCEDIDAS',
          'Demasiadas tentativas. Tenta novamente mais tarde.',
        );
      }
      entry = { count: 0, until: currentTime + windowMs };
      entries.set(key, entry);
    }
    if (entry.count >= limit) {
      response.setHeader('Retry-After', Math.max(1, Math.ceil((entry.until - currentTime) / 1000)));
      throw new ApiError(
        429,
        'TENTATIVAS_EXCEDIDAS',
        'Demasiadas tentativas. Tenta novamente mais tarde.',
      );
    }
    entry.count++;
  }
  const byIp: RequestHandler = (request, response, next) => {
    consume('ip:' + request.ip, ipLimit, response);
    next();
  };
  const byAccount: RequestHandler = (_request, response, next) => {
    const email = (response.locals.validated as { email: string }).email;
    consume(
      'account:' + createHmac('sha256', secret).update(email).digest('hex'),
      accountLimit,
      response,
    );
    next();
  };
  return { byIp, byAccount };
}
