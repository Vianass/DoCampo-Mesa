import { z } from 'zod';

const environmentSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    API_HOST: z.string().trim().min(1).default('127.0.0.1'),
    API_PORT: z.coerce.number().int().min(1).max(65535).default(3001),
    MONGODB_URI: z.string().regex(/^mongodb(?:\+srv)?:\/\/\S+$/),
    MONGODB_DB_NAME: z.string().regex(/^[a-zA-Z0-9_-]+$/),
    MONGODB_SERVER_SELECTION_TIMEOUT_MS: z.coerce.number().int().min(100).max(60_000).default(5000),
    SHUTDOWN_TIMEOUT_MS: z.coerce.number().int().min(100).max(60_000).default(10_000),
  })
  .superRefine((value, context) => {
    if (value.NODE_ENV === 'test' && !value.MONGODB_DB_NAME.startsWith('docampo_test_')) {
      context.addIssue({
        code: 'custom',
        path: ['MONGODB_DB_NAME'],
        message: 'Base de teste isolada obrigatória.',
      });
    }
  });

export class ConfigurationError extends Error {
  readonly campos: string[];

  constructor(campos: string[]) {
    super('Configuração de ambiente inválida.');
    this.name = 'ConfigurationError';
    this.campos = [...new Set(campos)];
  }
}

export function parseEnvironment(environment: NodeJS.ProcessEnv = process.env) {
  const result = environmentSchema.safeParse(environment);
  if (!result.success) {
    throw new ConfigurationError(result.error.issues.map((issue) => issue.path.join('.')));
  }

  const value = result.data;
  return {
    environment: value.NODE_ENV,
    host: value.API_HOST,
    port: value.API_PORT,
    mongoUri: value.MONGODB_URI,
    databaseName: value.MONGODB_DB_NAME,
    selectionTimeoutMs: value.MONGODB_SERVER_SELECTION_TIMEOUT_MS,
    shutdownTimeoutMs: value.SHUTDOWN_TIMEOUT_MS,
  };
}

export type ApiConfiguration = ReturnType<typeof parseEnvironment>;
