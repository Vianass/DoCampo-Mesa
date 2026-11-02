import { describe, it, expect, vi } from 'vitest';
import { parseEnvironment } from '../../src/config/environment.js';
import { startApi } from '../../src/runtime.js';
import type { ImageStorage } from '../../src/modules/images/image.storage.js';
import * as documentation from '../../src/documentation/openapi.js';
const values = {
  NODE_ENV: 'production',
  MONGODB_URI: 'mongodb+srv://cluster.example.invalid/',
  MONGODB_DB_NAME: 'docampo',
};
describe('preparação PaaS sem dependência de localhost', () => {
  it('liberta MongoDB antes de abrir HTTP se a documentação não puder ser preparada', async () => {
    const close = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(documentation, 'documentedApi').mockImplementationOnce(() => {
      throw Error('Contrato de teste indisponível');
    });
    await expect(
      startApi({ ...parseEnvironment(values), port: 0 }, { connect: async () => ({ close }) }),
    ).rejects.toThrow('preparar os contratos HTTP');
    expect(close).toHaveBeenCalledOnce();
  });
  it('aceita PORT e escuta em todas as interfaces apenas por omissão em produção', () => {
    expect(parseEnvironment({ ...values, PORT: '8080' })).toMatchObject({
      host: '0.0.0.0',
      port: 8080,
    });
    expect(
      parseEnvironment({ ...values, PORT: '8080', API_PORT: '9090', API_HOST: '127.0.0.1' }),
    ).toMatchObject({ host: '127.0.0.1', port: 9090 });
    expect(parseEnvironment({ ...values, NODE_ENV: 'development' }).host).toBe('127.0.0.1');
  });
  it.each(['0', 'abc', '65536'])('recusa PORT inválida %s', (PORT) => {
    expect(() => parseEnvironment({ ...values, PORT })).toThrow();
  });
  it.each([
    { kind: 'development', publicBase: 'https://images.example.invalid' },
    { kind: 'cloud', publicBase: 'http://images.example.invalid' },
    { kind: 'cloud', publicBase: 'https://images.example.invalid/?token=ficticio' },
  ])('recusa adaptador local ou URL Cloud insegura em produção', async (storage) => {
    const close = vi.fn().mockResolvedValue(undefined);
    await expect(
      startApi(
        { ...parseEnvironment(values), port: 0 },
        { connect: async () => ({ close }), imageStorage: storage as ImageStorage },
      ),
    ).rejects.toThrow('Adaptador de imagens Cloud');
    expect(close).toHaveBeenCalledOnce();
  });
});
