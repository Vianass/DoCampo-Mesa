import { createHmac, randomBytes } from 'node:crypto';
import type { RequestHandler } from 'express';
import { ApiError } from '../../http/api-error.js';
export interface AuctionRateOptions {
  ipLimit?: number;
  accountLimit?: number;
  windowMs?: number;
  maxEntries?: number;
  now?: () => number;
}
export function createAuctionRateLimit(options: AuctionRateOptions = {}) {
  const ipLimit = options.ipLimit ?? 120,
    accountLimit = options.accountLimit ?? 60,
    windowMs = options.windowMs ?? 60000,
    maximum = options.maxEntries ?? 10000,
    now = options.now ?? Date.now,
    key = randomBytes(32);
  for (const n of [ipLimit, accountLimit, windowMs, maximum])
    if (!Number.isSafeInteger(n) || n < 1) throw Error('Limite de leilões inválido.');
  const entries = new Map<string, { count: number; until: number }>();
  function consume(identity: string, limit: number, response: Parameters<RequestHandler>[1]) {
    const time = now();
    for (const [id, v] of entries) if (v.until <= time) entries.delete(id);
    const id = createHmac('sha256', key).update(identity).digest('hex');
    let entry = entries.get(id);
    if (!entry && entries.size < maximum) {
      entry = { count: 0, until: time + windowMs };
      entries.set(id, entry);
    }
    if (!entry || entry.count >= limit) {
      response.setHeader(
        'Retry-After',
        Math.max(1, Math.ceil(((entry?.until ?? time + windowMs) - time) / 1000)),
      );
      throw new ApiError(
        429,
        'TENTATIVAS_EXCEDIDAS',
        'Demasiados pedidos. Tenta novamente mais tarde.',
      );
    }
    entry.count++;
  }
  const byIp: RequestHandler = (req, res, next) => {
    consume('ip:' + req.ip, ipLimit, res);
    next();
  };
  return {
    byIp,
    account: (id: string, response: Parameters<RequestHandler>[1]) =>
      consume('conta:' + id, accountLimit, response),
  };
}
