import { createServer } from 'node:http';
import { describe, expect, it, vi } from 'vitest';
import { parseEnvironment } from '../../src/config/environment.js';
import { startApi } from '../../src/runtime.js';

const configuration = {
  ...parseEnvironment({
    MONGODB_URI: 'mongodb://127.0.0.1:27019/',
    MONGODB_DB_NAME: 'docampo_test_runtime',
    NODE_ENV: 'test',
  }),
  port: 0,
};

describe('ciclo de vida HTTP', () => {
  it('não abre HTTP quando a ligação falha', async () => {
    const connect = vi.fn().mockRejectedValue(new Error('ligação indisponível'));
    await expect(startApi(configuration, { connect })).rejects.toThrow('ligação indisponível');
    expect(connect).toHaveBeenCalledOnce();
  });

  it('encerra HTTP e base de dados uma única vez, mesmo com dois pedidos de encerramento', async () => {
    const close = vi.fn().mockResolvedValue(undefined);
    const runtime = await startApi(configuration, { connect: async () => ({ close }) });
    expect(runtime.server.listening).toBe(true);
    const first = runtime.close();
    expect(runtime.close()).toBe(first);
    await first;
    expect(runtime.server.listening).toBe(false);
    expect(close).toHaveBeenCalledOnce();
  });

  it('liberta a conexão se a porta HTTP estiver ocupada', async () => {
    const occupied = createServer();
    await new Promise<void>((resolve) => occupied.listen(0, '127.0.0.1', resolve));
    const address = occupied.address();
    if (!address || typeof address === 'string') throw new Error('Porta de teste indisponível.');
    const close = vi.fn().mockResolvedValue(undefined);
    try {
      await expect(
        startApi({ ...configuration, port: address.port }, { connect: async () => ({ close }) }),
      ).rejects.toThrow('Não foi possível iniciar');
      expect(close).toHaveBeenCalledOnce();
    } finally {
      await new Promise<void>((resolve) => occupied.close(() => resolve()));
    }
  });

  it('limita o encerramento e força a libertação quando uma dependência fica pendurada', async () => {
    const close = vi.fn((force?: boolean) =>
      force ? Promise.resolve() : new Promise<void>(() => undefined),
    );
    const runtime = await startApi(
      { ...configuration, shutdownTimeoutMs: 100 },
      { connect: async () => ({ close }) },
    );
    await expect(runtime.close()).rejects.toThrow('tempo permitido');
    expect(close).toHaveBeenCalledWith(true);
    expect(runtime.server.listening).toBe(false);
  });
});
