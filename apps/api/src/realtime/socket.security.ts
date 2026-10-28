import { isIP } from 'node:net';
import type { IncomingMessage } from 'node:http';
import type { AuthConfiguration } from '../config/auth-environment.js';
import { ApiError } from '../http/api-error.js';
import { SocketRateError } from './auction.limits.js';
import type { RealtimeError } from './auction.protocol.js';

const normal = (ip: string) => (ip.startsWith('::ffff:') ? ip.slice(7) : ip);
export function socketPeer(req: IncomingMessage, config: AuthConfiguration) {
  const direct = normal(req.socket.remoteAddress ?? ''),
    trusted = config.trustedProxies.map(normal);
  let ip = direct;
  if (trusted.includes(direct)) {
    const chain = String(req.headers['x-forwarded-for'] ?? '')
      .split(',')
      .map((s) => normal(s.trim()))
      .filter(Boolean);
    for (const item of chain.reverse()) {
      if (!isIP(item)) break;
      ip = item;
      if (!trusted.includes(item)) break;
    }
  }
  const tls = 'encrypted' in req.socket && req.socket.encrypted === true;
  const secure = tls || (trusted.includes(direct) && req.headers['x-forwarded-proto'] === 'https');
  return { ip, secure };
}
export function allowSocketRequest(req: IncomingMessage, config: AuthConfiguration) {
  const origin = req.headers.origin;
  if (origin !== undefined && !config.allowedOrigins.includes(origin)) return false;
  if (config.production && !socketPeer(req, config).secure) return false;
  // Credenciais só no auth do namespace: não aceitar tokens na query nem em headers alternativos.
  const url = new URL(req.url ?? '/', 'http://socket.invalid');
  if (
    [...url.searchParams.keys()].some((k) => !['EIO', 'transport', 'sid', 't', 'b64'].includes(k))
  )
    return false;
  return req.headers.authorization === undefined;
}
export function safeSocketError(error: unknown): RealtimeError {
  if (error instanceof ApiError)
    return {
      status: error.status,
      codigo: error.codigo,
      mensagem: error.message,
      ...(error.campos ? { campos: error.campos } : {}),
      ...(error instanceof SocketRateError ? { repetirEmSegundos: error.retryAfter } : {}),
    };
  return { status: 500, codigo: 'ERRO_INTERNO', mensagem: 'Não foi possível concluir o pedido.' };
}
