import { z } from 'zod';
import { ConfigurationError } from './environment.js';

const schema = z.object({
  SOCKET_ENABLED: z.enum(['true', 'false']).default('true'),
  SOCKET_SYNC_INTERVAL_MS: z.coerce.number().int().min(50).max(5000).default(500),
  SOCKET_AUTH_INTERVAL_MS: z.coerce.number().int().min(50).max(5000).default(1000),
});
export function parseRealtimeEnvironment(environment: NodeJS.ProcessEnv = process.env) {
  const result = schema.safeParse(environment);
  if (!result.success)
    throw new ConfigurationError(result.error.issues.map((i) => i.path.join('.')));
  return {
    enabled: result.data.SOCKET_ENABLED === 'true',
    syncIntervalMs: result.data.SOCKET_SYNC_INTERVAL_MS,
    authIntervalMs: result.data.SOCKET_AUTH_INTERVAL_MS,
  };
}
export type RealtimeConfiguration = ReturnType<typeof parseRealtimeEnvironment>;
