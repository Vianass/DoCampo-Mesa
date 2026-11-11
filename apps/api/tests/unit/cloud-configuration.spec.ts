import { describe, expect, it } from 'vitest';
import { randomBytes } from 'node:crypto';
import { parseAuthEnvironment } from '../../src/config/auth-environment.js';
import { parseEnvironment } from '../../src/config/environment.js';
import { cloudOperationEnvironment } from '../../src/deployment/operations.js';
import { referencedImageIds } from '../../src/modules/images/image.references.js';

const auth = {
  NODE_ENV: 'production',
  JWT_SECRET: randomBytes(48).toString('base64url'),
  PROXY_MODE: 'render',
  RENDER: 'true',
  CORS_ORIGINS: 'https://web.example.invalid',
};
describe('configuração Cloud e limites seguros', () => {
  it('o modo Render é explícito, limitado a um proxy e dependente do ambiente da plataforma', () => {
    expect(parseAuthEnvironment(auth).trustedProxyHops).toBe(1);
    expect(parseAuthEnvironment({ ...auth, PROXY_MODE: 'ips' }).trustedProxyHops).toBeUndefined();
    for (const change of [
      { RENDER: undefined },
      { NODE_ENV: 'development' },
      { TRUSTED_PROXY_IPS: '127.0.0.1' },
      { PROXY_MODE: 'qualquer' },
    ])
      expect(() => parseAuthEnvironment({ ...auth, ...change })).toThrow();
  });
  it.each([
    'tls=false',
    'ssl=false',
    'tlsInsecure=true',
    'tlsAllowInvalidCertificates=true',
    'tlsAllowInvalidHostnames=true',
    '%74ls=fa%6cse',
    'tls%49nsecure=%74rue',
  ])('recusa TLS enfraquecido em produção: %s', (option) => {
    expect(() =>
      parseEnvironment({
        NODE_ENV: 'production',
        MONGODB_URI: 'mongodb+srv://cluster.example.invalid/?' + option,
        MONGODB_DB_NAME: 'docampo_demo',
      }),
    ).toThrow();
  });
  it('limita pool e espera de ligações sem modificar configuração de transações', () => {
    const value = {
      NODE_ENV: 'production',
      MONGODB_URI: 'mongodb+srv://cluster.example.invalid/',
      MONGODB_DB_NAME: 'docampo_demo',
    };
    expect(parseEnvironment(value)).toMatchObject({ maxPoolSize: 10, waitQueueTimeoutMs: 5000 });
    for (const change of [
      { MONGODB_MAX_POOL_SIZE: '0' },
      { MONGODB_MAX_POOL_SIZE: '51' },
      { MONGODB_WAIT_QUEUE_TIMEOUT_MS: '0' },
    ])
      expect(() => parseEnvironment({ ...value, ...change })).toThrow();
    expect(() =>
      parseEnvironment({
        ...value,
        PROXY_MODE: 'render',
        MONGODB_URI: 'mongodb://cluster.example.invalid/',
      }),
    ).toThrow();
  });
  it('operações manuais exigem confirmação explícita da base demonstrativa', () => {
    const value = {
      NODE_ENV: 'production',
      MONGODB_URI: 'mongodb+srv://cluster.example.invalid/',
      MONGODB_DB_NAME: 'docampo_demo',
      CLOUD_DATABASE_CONFIRM: 'docampo_demo',
    };
    expect(cloudOperationEnvironment(value).databaseName).toBe('docampo_demo');
    expect(() =>
      cloudOperationEnvironment({ ...value, CLOUD_DATABASE_CONFIRM: undefined }),
    ).toThrow();
    expect(() =>
      cloudOperationEnvironment({
        ...value,
        MONGODB_DB_NAME: 'clientes_reais',
        CLOUD_DATABASE_CONFIRM: 'clientes_reais',
      }),
    ).toThrow();
  });
  it('encontra fotografias em estruturas e textos históricos sem depender do schema atual', () => {
    const id = '12345678-1234-1234-1234-123456789abc.webp';
    expect([
      ...referencedImageIds({
        antigo: [{ evidencias: { url: 'https://api.example.invalid/api/media/' + id } }],
        texto: 'Fotografia ' + id,
        bytes: Buffer.from(id),
      }),
    ]).toEqual([id]);
  });
});
