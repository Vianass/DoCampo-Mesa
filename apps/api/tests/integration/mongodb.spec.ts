import { randomBytes, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parseEnvironment } from '../../src/config/environment.js';
import { connectDatabase, DatabaseConnectionError } from '../../src/database/connection.js';
import { startApi } from '../../src/runtime.js';

const testUri = 'mongodb://127.0.0.1:27019/?replicaSet=rs-dcm-test&directConnection=true';
const configuration = parseEnvironment({
  NODE_ENV: 'test',
  MONGODB_URI: testUri,
  MONGODB_DB_NAME: `docampo_test_${randomUUID().replaceAll('-', '')}`,
  MONGODB_SERVER_SELECTION_TIMEOUT_MS: '2000',
});
let database: Awaited<ReturnType<typeof connectDatabase>> | undefined;

beforeAll(async () => {
  // Sem fallback para .env, Atlas, desenvolvimento ou uma simulação em memória.
  database = await connectDatabase(configuration);
  const hello = await database.connection.db!.admin().command({ hello: 1 });
  expect(hello.setName).toBe('rs-dcm-test');
  expect(hello.hosts).toHaveLength(1);
  expect(hello.isWritablePrimary).toBe(true);
});

afterAll(async () => {
  if (!database) return;
  try {
    // Nome aleatório criado por esta suite, conexão fixa ao replica set de teste.
    await database.connection.dropDatabase();
  } finally {
    await database.close();
  }
});

function connection() {
  if (!database) throw new Error('Ambiente MongoDB de teste indisponível.');
  return database.connection;
}

describe('MongoDB 8 real e isolado', () => {
  it('liga por Mongoose e confirma a versão e a topologia reais', async () => {
    const info = await connection().db!.admin().command({ buildInfo: 1 });
    expect(info.version).toBe('8.0.34');
    expect(connection().name).toBe(configuration.databaseName);
    expect(connection().modelNames()).toEqual([]);
    console.info('EVIDENCIA_MONGODB: 8.0.34; rs-dcm-test; 1 membro; sem schemas comerciais.');
  });

  it('confirma as duas escritas técnicas na mesma transação', async () => {
    const collection = await connection().createCollection('foundation_commit');
    await connection().transaction(async (session) => {
      await collection.insertOne({ etapa: 'primeira' }, { session });
      await collection.insertOne({ etapa: 'segunda' }, { session });
    });
    expect(await collection.countDocuments()).toBe(2);
    console.info('EVIDENCIA_TRANSACAO_COMMIT: 2 escritas confirmadas.');
  });

  it('reverte a primeira escrita quando a segunda etapa falha', async () => {
    const collection = await connection().createCollection('foundation_rollback');
    await expect(
      connection().transaction(async (session) => {
        await collection.insertOne({ etapa: 'primeira' }, { session });
        throw new Error('Falha técnica deliberada antes da segunda escrita.');
      }),
    ).rejects.toThrow('Falha técnica deliberada');
    expect(await collection.countDocuments()).toBe(0);
    console.info('EVIDENCIA_TRANSACAO_ROLLBACK: 0 escritas persistidas após falha.');
  });

  it('mantém uma escrita anterior quando uma transação posterior é abortada', async () => {
    const collection = await connection().createCollection('foundation_existing');
    await collection.insertOne({ etapa: 'anterior' });
    await expect(
      connection().transaction(async (session) => {
        await collection.updateOne(
          { etapa: 'anterior' },
          { $set: { etapa: 'alterada' } },
          { session },
        );
        await collection.insertOne({ etapa: 'nova' }, { session });
        throw new Error('Abortar alterações técnicas.');
      }),
    ).rejects.toThrow('Abortar');
    expect(await collection.find({}, { projection: { _id: 0 } }).toArray()).toEqual([
      { etapa: 'anterior' },
    ]);
  });

  it('recusa ligação indisponível sem propagar URI ou erro do driver', async () => {
    await expect(
      connectDatabase({
        ...configuration,
        mongoUri: 'mongodb://utilizador:segredo@127.0.0.1:1/?directConnection=true',
        selectionTimeoutMs: 100,
      }),
    ).rejects.toEqual(new DatabaseConnectionError());
  });

  it('arranca HTTP só com ligação válida e encerra ambos os recursos', async () => {
    const runtime = await startApi({ ...configuration, port: 0 });
    try {
      const address = runtime.server.address();
      if (!address || typeof address === 'string') throw new Error('Servidor sem porta.');
      const response = await fetch(`http://127.0.0.1:${address.port}/api/health`);
      expect(response.status).toBe(200);
    } finally {
      await runtime.close();
    }
    expect(runtime.server.listening).toBe(false);
  });

  it('falha no arranque com configuração inválida e não imprime credenciais', async () => {
    const child = spawn(process.execPath, ['--import', 'tsx', 'src/server.ts'], {
      cwd: process.cwd(),
      env: {
        PATH: process.env.PATH,
        NODE_ENV: 'test',
        MONGODB_URI: 'https://utilizador:segredo@privado.invalid',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    child.stdout.on('data', (chunk: Buffer) => {
      output += chunk.toString();
    });
    child.stderr.on('data', (chunk: Buffer) => {
      output += chunk.toString();
    });
    const [code] = await once(child, 'exit');
    expect(code).toBe(1);
    expect(output).toContain('CONFIGURACAO_INVALIDA');
    expect(output).not.toContain('segredo');
    expect(output).not.toContain('API_INICIADA');
  });

  it('termina o processo por SIGTERM depois de libertar recursos', async () => {
    const child = spawn(process.execPath, ['--import', 'tsx', 'src/server.ts'], {
      cwd: process.cwd(),
      env: {
        PATH: process.env.PATH,
        NODE_ENV: 'test',
        MONGODB_URI: testUri,
        MONGODB_DB_NAME: configuration.databaseName,
        JWT_SECRET: randomBytes(32).toString('base64url'),
        API_PORT: '3099',
        SHUTDOWN_TIMEOUT_MS: '2000',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    child.stdout.on('data', (chunk: Buffer) => {
      output += chunk.toString();
    });
    child.stderr.on('data', (chunk: Buffer) => {
      output += chunk.toString();
    });
    const exited = once(child, 'exit');
    try {
      for (
        let attempt = 0;
        attempt < 100 && !output.includes('API_INICIADA') && child.exitCode === null;
        attempt++
      )
        await delay(50);
      expect(output).toContain('API_INICIADA');
      child.kill('SIGTERM');
      const [code, signal] = await exited;
      expect(code).toBe(0);
      expect(signal).toBeNull();
      expect(output).toContain('API_ENCERRADA');
    } finally {
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    }
  });
});
