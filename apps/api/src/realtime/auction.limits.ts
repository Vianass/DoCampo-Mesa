import { createHmac, randomBytes } from 'node:crypto';
import { ApiError } from '../http/api-error.js';

export interface SocketLimits {
  connectionAttempts?: number;
  eventsPerIp?: number;
  eventsPerAccount?: number;
  bidsPerAccount?: number;
  socketsPerAccount?: number;
  socketsPerIp?: number;
  totalSockets?: number;
  roomsPerSocket?: number;
  queuedPerSocket?: number;
  maxEntries?: number;
  windowMs?: number;
}
export class SocketRateError extends ApiError {
  constructor(readonly retryAfter: number) {
    super(429, 'TENTATIVAS_EXCEDIDAS', 'Demasiados pedidos. Tenta novamente mais tarde.');
  }
}
export function createSocketLimits(options: SocketLimits = {}, now = Date.now) {
  const limits = {
    connectionAttempts: 30,
    eventsPerIp: 240,
    eventsPerAccount: 120,
    bidsPerAccount: 60,
    socketsPerAccount: 8,
    socketsPerIp: 50,
    totalSockets: 1000,
    roomsPerSocket: 10,
    queuedPerSocket: 8,
    maxEntries: 10000,
    windowMs: 60000,
    ...options,
  };
  for (const v of Object.values(limits))
    if (!Number.isSafeInteger(v) || v < 1) throw Error('Limite Socket.IO inválido.');
  const secret = randomBytes(32),
    buckets = new Map<string, { count: number; end: number }>(),
    active = new Map<string, number>();
  let total = 0;
  const key = (s: string) => createHmac('sha256', secret).update(s).digest('hex');
  function consume(identity: string, maximum: number) {
    const time = now();
    for (const [id, b] of buckets) if (b.end <= time) buckets.delete(id);
    const id = key(identity);
    let b = buckets.get(id);
    if (!b && buckets.size < limits.maxEntries) {
      b = { count: 0, end: time + limits.windowMs };
      buckets.set(id, b);
    }
    if (!b || b.count >= maximum)
      throw new SocketRateError(
        Math.max(1, Math.ceil(((b?.end ?? time + limits.windowMs) - time) / 1000)),
      );
    b.count++;
  }
  return {
    limits,
    attempt(ip: string) {
      consume('connect:' + ip, limits.connectionAttempts);
    },
    event(ip: string, account: string, bid: boolean) {
      consume('ip:' + ip, limits.eventsPerIp);
      consume('account:' + account, limits.eventsPerAccount);
      if (bid) consume('bid:' + account, limits.bidsPerAccount);
    },
    acquire(ip: string, account: string) {
      const keys = [key('ip:' + ip), key('account:' + account)];
      if (
        total >= limits.totalSockets ||
        (active.get(keys[0]!) ?? 0) >= limits.socketsPerIp ||
        (active.get(keys[1]!) ?? 0) >= limits.socketsPerAccount
      )
        throw new SocketRateError(1);
      total++;
      for (const k of keys) active.set(k, (active.get(k) ?? 0) + 1);
      let released = false;
      return () => {
        if (released) return;
        released = true;
        total--;
        for (const k of keys) {
          const n = (active.get(k) ?? 1) - 1;
          if (n) active.set(k, n);
          else active.delete(k);
        }
      };
    },
    get activeSockets() {
      return total;
    },
  };
}
