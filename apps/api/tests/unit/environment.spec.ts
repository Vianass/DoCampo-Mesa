import { describe, expect, it } from 'vitest';
import { ConfigurationError, parseEnvironment } from '../../src/config/environment.js';

const valid = { MONGODB_URI: 'mongodb://127.0.0.1:27018/', MONGODB_DB_NAME: 'docampo_dev' };

describe('configuração de ambiente', () => {
  it('valida os valores e aplica os valores técnicos por omissão', () => {
    expect(parseEnvironment(valid)).toMatchObject({
      host: '127.0.0.1',
      port: 3001,
      databaseName: 'docampo_dev',
      selectionTimeoutMs: 5000,
      shutdownTimeoutMs: 10000,
    });
  });

  it.each([
    ['API_PORT', '0'],
    ['API_PORT', '65536'],
    ['API_PORT', 'abc'],
    ['API_PORT', ''],
    ['API_HOST', ''],
    ['NODE_ENV', 'demo'],
    ['MONGODB_URI', 'https://exemplo.invalid'],
    ['MONGODB_DB_NAME', 'base/errada'],
    ['MONGODB_SERVER_SELECTION_TIMEOUT_MS', '0'],
    ['SHUTDOWN_TIMEOUT_MS', '-1'],
  ])('recusa configuração inválida de %s (%s)', (field, value) => {
    expect(() => parseEnvironment({ ...valid, [field]: value })).toThrow(ConfigurationError);
  });

  it('recusa configuração em falta sem revelar valores privados', () => {
    try {
      parseEnvironment({ MONGODB_URI: 'https://utilizador:segredo@privado.invalid' });
      expect.fail('A configuração inválida devia ter sido recusada.');
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigurationError);
      expect(JSON.stringify(error)).not.toContain('segredo');
      expect((error as ConfigurationError).campos).toEqual(['MONGODB_URI', 'MONGODB_DB_NAME']);
    }
  });

  it('aceita URI Atlas sem a expor ou exigir ligação durante a validação', () => {
    expect(
      parseEnvironment({ ...valid, MONGODB_URI: 'mongodb+srv://exemplo.invalid/' }).mongoUri,
    ).toBe('mongodb+srv://exemplo.invalid/');
  });

  it('recusa utilização da base de desenvolvimento em modo de teste', () => {
    expect(() => parseEnvironment({ ...valid, NODE_ENV: 'test' })).toThrow(ConfigurationError);
  });

  it('mantém o nome de teste explicitamente isolado', () => {
    expect(
      parseEnvironment({ ...valid, NODE_ENV: 'test', MONGODB_DB_NAME: 'docampo_test_exemplo' })
        .environment,
    ).toBe('test');
  });
});
